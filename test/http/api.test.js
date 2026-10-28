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

  /** Waits for something the server does a moment after the socket drops. */
  const until = async (condition, timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs;
    while (!condition() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };

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

  test('the page can say it is open, without a token', async () => {
    // EventSource cannot send headers, so this endpoint is outside /api. It
    // carries nothing but the fact that a window is there.
    const abort = new AbortController();
    const response = await fetch(`${base}/alive`, { signal: abort.signal });

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.equal(container.presence.count, 1);

    abort.abort();
    await until(() => container.presence.count === 0);
    assert.equal(container.presence.count, 0, 'a window that goes away is not still counted');

    // Leave the stream undrained; the response body is of no interest here.
    await response.body?.cancel().catch(() => {});
  });

  test('the live-reload endpoint does not exist outside dev mode', async () => {
    // It sits outside /api because EventSource cannot send the session token,
    // so it must simply not be there unless the app was started with --dev.
    const response = await fetch(`${base}/dev/events`);

    assert.equal(response.status, 404);
    assert.equal(container.devChannel, null);
  });

  /*
   * Every endpoint, exercised through the real router and server. The route
   * modules are thin, so this is where they are covered rather than with one
   * test file each.
   */
  describe('every endpoint answers', () => {
    test('meta and health describe the running app', async () => {
      const meta = await call('GET', '/meta');

      assert.equal(meta.status, 200);
      assert.equal(meta.payload.product, 'ShopWise');
      assert.ok(meta.payload.version);
      assert.equal(meta.payload.storage.adapter, 'in-memory');
      assert.ok(meta.payload.settings.currency);

      assert.equal((await call('GET', '/health')).payload.ok, true);
    });

    test('settings can be read and changed', async () => {
      assert.equal((await call('GET', '/settings')).status, 200);

      const updated = await call('PATCH', '/settings', { lowStockAt: 9 });
      assert.equal(updated.status, 200);
      assert.equal(updated.payload.lowStockAt, 9);
      assert.equal((await call('GET', '/settings')).payload.lowStockAt, 9);

      assert.equal((await call('PATCH', '/settings', { lowStockAt: -5 })).status, 400);
    });

    test('a product can be listed, changed and hidden', async () => {
      const created = await call('POST', '/products', { name: 'Tea', unit: 'kg', price: '3.00' });
      const id = created.payload.id;

      assert.ok((await call('GET', '/products')).payload.some((row) => row.id === id));

      const patched = await call('PATCH', `/products/${id}`, { price: '3.50' });
      assert.equal(patched.payload.price, 350);

      assert.equal((await call('DELETE', `/products/${id}`)).payload.archived, true);
      assert.ok(!(await call('GET', '/products')).payload.some((row) => row.id === id), 'hidden by default');
      assert.ok(
        (await call('GET', '/products?includeArchived=true')).payload.some((row) => row.id === id),
        'but still reachable'
      );
    });

    test('stock levels, low stock, movements and undoing a delivery', async () => {
      const product = (await call('POST', '/products', { name: 'Sacks', unit: 'bag', price: '2.00' })).payload;
      const entry = (await call('POST', '/stock', { productId: product.id, quantity: 4 })).payload;

      const levels = await call('GET', '/stock');
      assert.equal(levels.payload.find((row) => row.id === product.id).onHand, 4);

      assert.equal((await call('GET', '/stock/low')).status, 200);

      const movements = await call('GET', `/stock/products/${product.id}/movements`);
      assert.equal(movements.payload.total, 1);
      assert.equal(movements.payload.entries[0].kind, 'in');
      assert.equal(movements.payload.hasMore, false);

      assert.equal((await call('GET', `/stock/products/${product.id}/movements?limit=1`)).payload.entries.length, 1);
      assert.equal((await call('GET', `/stock/products/${product.id}/movements?limit=0`)).status, 400);

      assert.equal((await call('DELETE', `/stock/entries/${entry.id}`)).payload.removed, true);
      assert.equal((await call('GET', '/stock')).payload.find((row) => row.id === product.id).onHand, 0);
    });

    test('sales can be listed, fetched and deleted', async () => {
      const product = (await call('POST', '/products', { name: 'Rolls', price: '1.00' })).payload;
      await call('POST', '/stock', { productId: product.id, quantity: 10 });
      const customer = (await call('POST', '/customers', { name: 'Dana' })).payload;

      const sale = (
        await call('POST', '/sales', {
          customerId: customer.id,
          items: [{ productId: product.id, quantity: 2 }],
        })
      ).payload.sale;

      assert.ok((await call('GET', '/sales')).payload.some((row) => row.id === sale.id));
      assert.equal((await call('GET', `/sales?customerId=${customer.id}`)).payload.length, 1);
      assert.equal((await call('GET', `/sales/${sale.id}`)).payload.total, 200);
      assert.equal((await call('GET', '/sales/nope')).status, 404);

      assert.equal((await call('DELETE', `/sales/${sale.id}`)).payload.removed, true);
      assert.equal((await call('GET', `/sales/${sale.id}`)).status, 404);
      assert.equal(
        (await call('GET', '/stock')).payload.find((row) => row.id === product.id).onHand,
        10,
        'deleting the sale put the stock back'
      );
    });

    test('payments can be listed and deleted, and the balance follows', async () => {
      const customer = (await call('POST', '/customers', { name: 'Eve' })).payload;
      const payment = (await call('POST', '/payments', { customerId: customer.id, amount: '15' })).payload;

      assert.ok((await call('GET', '/payments')).payload.some((row) => row.id === payment.id));
      assert.equal((await call('GET', `/payments?customerId=${customer.id}`)).payload.length, 1);

      const before = await call('GET', `/customers/${customer.id}/statement`);
      assert.equal(before.payload.balance, -1500, 'paid ahead');

      assert.equal((await call('DELETE', `/payments/${payment.id}`)).payload.removed, true);
      assert.equal((await call('GET', `/customers/${customer.id}/statement`)).payload.balance, 0);
    });

    test('a customer can be changed and hidden', async () => {
      const customer = (await call('POST', '/customers', { name: 'Frank' })).payload;

      assert.equal(
        (await call('PATCH', `/customers/${customer.id}`, { name: 'Frank Lee' })).payload.name,
        'Frank Lee'
      );
      assert.equal((await call('DELETE', `/customers/${customer.id}`)).payload.archived, true);
      assert.ok(!(await call('GET', '/customers')).payload.some((row) => row.id === customer.id));
    });

    test('a statement takes a limit, and refuses a silly one', async () => {
      const customer = (await call('POST', '/customers', { name: 'Gail' })).payload;

      assert.equal((await call('GET', `/customers/${customer.id}/statement?limit=5`)).status, 200);
      assert.equal((await call('GET', `/customers/${customer.id}/statement?limit=0`)).status, 400);
      assert.equal((await call('GET', `/customers/${customer.id}/statement?limit=abc`)).status, 400);
    });

    test('the sales report takes a period and filters', async () => {
      const all = await call('GET', '/reports/sales?preset=all');

      assert.equal(all.status, 200);
      assert.ok(Array.isArray(all.payload.lines));
      assert.ok(Array.isArray(all.payload.options.products));

      assert.equal((await call('GET', '/reports/sales?from=2026-01-01&to=2026-01-31')).status, 200);
      assert.equal((await call('GET', '/reports/sales?preset=fortnight')).status, 400);
      assert.equal((await call('GET', '/reports/sales?from=2026-03-10&to=2026-03-01')).status, 400);

      const filtered = await call('GET', '/reports/sales?preset=all&productId=nothing-matches');
      assert.equal(filtered.status, 200);
      assert.deepEqual(filtered.payload.lines, [], 'a filter matching nothing is empty, not an error');
    });

    test('the overview answers', async () => {
      const overview = await call('GET', '/overview');

      assert.equal(overview.status, 200);
      assert.ok('today' in overview.payload);
      assert.ok('month' in overview.payload);
      assert.ok('ledger' in overview.payload);
    });
  });

  test('rejects writes to the static side', async () => {
    const response = await fetch(`${base}/styles/tokens.css`, { method: 'POST' });
    assert.equal(response.status, 405);
  });
});
