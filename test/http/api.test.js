'use strict';

const assert = require('node:assert/strict');
const { test, describe, before, after } = require('node:test');

const { createFixture } = require('../support/fixture');

/**
 * Exercises the real HTTP surface over an in-memory store: routing, the token
 * guard, status codes and the shape the UI is written against.
 */
describe('the HTTP API', () => {
  let container;
  let base;
  let token;

  before(async () => {
    container = createFixture();
    await container.server.listen();
    base = container.server.url.replace(/\/$/, '');
    token = container.sessionToken.value;
  });

  after(async () => {
    await container.server.close();
  });

  const call = async (method, route, body) => {
    const response = await fetch(`${base}/api${route}`, {
      method,
      headers: {
        'x-shopwise-token': token,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, payload: await response.json().catch(() => null) };
  };

  test('serves the page with the token substituted in', async () => {
    const response = await fetch(`${base}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.ok(html.includes(token));
    assert.ok(!html.includes('{{'), 'no placeholders should survive');
  });

  test('turns away API calls with no token, a wrong token, or a truncated one', async () => {
    assert.equal((await fetch(`${base}/api/overview`)).status, 401);

    for (const candidate of ['', 'wrong', token.slice(0, -1), `${token}x`]) {
      const response = await fetch(`${base}/api/overview`, { headers: { 'x-shopwise-token': candidate } });
      assert.equal(response.status, 401, `accepted ${JSON.stringify(candidate)}`);
    }
  });

  test('refuses to serve files outside the UI folder', async () => {
    for (const attempt of ['/../package.json', '/..%2fpackage.json', '/src/config.js']) {
      const response = await fetch(`${base}${attempt}`);
      assert.ok([403, 404].includes(response.status), `${attempt} returned ${response.status}`);
    }
  });

  test('walks the whole shop workflow', async () => {
    const product = await call('POST', '/products', { name: 'Milk', unit: 'L', price: '1.40' });
    assert.equal(product.status, 201);

    const customer = await call('POST', '/customers', { name: 'Cafe Nero' });
    assert.equal(customer.status, 201);

    assert.equal((await call('POST', '/stock', { productId: product.payload.id, quantity: 30 })).status, 201);

    const stock = await call('GET', '/stock');
    assert.equal(stock.payload.find((row) => row.id === product.payload.id).onHand, 30);

    // Sold below the usual price: 10 x 1.25 = 12.50
    const sale = await call('POST', '/sales', {
      customerId: customer.payload.id,
      items: [{ productId: product.payload.id, quantity: 10, unitPrice: '1.25' }],
    });
    assert.equal(sale.status, 201);
    assert.equal(sale.payload.sale.total, 1250);
    assert.deepEqual(sale.payload.warnings, []);

    const customers = await call('GET', '/customers');
    assert.equal(customers.payload[0].balance, 1250);
    assert.equal(customers.payload[0].status, 'owes');

    assert.equal((await call('POST', '/payments', { customerId: customer.payload.id, amount: '10' })).status, 201);

    const statement = await call('GET', `/customers/${customer.payload.id}/statement`);
    assert.equal(statement.payload.balance, 250);
    assert.equal(statement.payload.entries.length, 2);

    const overview = await call('GET', '/overview');
    assert.equal(overview.payload.today.salesCount, 1);
    assert.equal(overview.payload.today.salesTotal, 1250);
    assert.equal(overview.payload.today.paymentsTotal, 1000);
    assert.equal(overview.payload.ledger.receivable, 250);
  });

  test('reports bad input as 400 with a message worth showing', async () => {
    const { status, payload } = await call('POST', '/products', { name: '', price: '1.00' });

    assert.equal(status, 400);
    assert.equal(payload.error, 'Enter a product name.');
  });

  test('reports a duplicate name as 409', async () => {
    await call('POST', '/products', { name: 'Sugar', price: '2.00' });
    const { status, payload } = await call('POST', '/products', { name: 'sugar', price: '2.00' });

    assert.equal(status, 409);
    assert.match(payload.error, /already in your products/i);
  });

  test('reports a missing record as 404', async () => {
    const { status, payload } = await call('GET', '/customers/nobody/statement');

    assert.equal(status, 404);
    assert.match(payload.error, /no longer exists/i);
  });

  test('unknown endpoints are 404, and bad JSON is 400', async () => {
    assert.equal((await call('GET', '/nope')).status, 404);

    const response = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: { 'x-shopwise-token': token, 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(response.status, 400);
  });

  test('the live-reload endpoint does not exist outside dev mode', async () => {
    // It sits outside /api because EventSource cannot send the session token,
    // so it must simply not be there unless the app was started with --dev.
    const response = await fetch(`${base}/dev/events`);

    assert.equal(response.status, 404);
    assert.equal(container.devChannel, null);
  });

  test('rejects writes to the static side', async () => {
    const response = await fetch(`${base}/styles/tokens.css`, { method: 'POST' });
    assert.equal(response.status, 405);
  });
});
