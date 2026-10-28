'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { createShop } = require('../support/fixture');

/** Buys `quantity` of coffee at the usual price. */
const buy = (services, customerId, coffeeId, quantity) =>
  services.sales.record({ customerId, items: [{ productId: coffeeId, quantity }] });

describe('customer balances', () => {
  test('a new customer owes nothing', async () => {
    const { services, alice } = await createShop();

    assert.deepEqual(services.ledger.positionFor(alice.id), {
      charged: 0,
      paid: 0,
      balance: 0,
      status: 'settled',
    });
  });

  test('taking goods builds up debt', async () => {
    const { services, coffee, alice } = await createShop();

    await buy(services, alice.id, coffee.id, 2); // 24.00
    await buy(services, alice.id, coffee.id, 1); // 12.00

    const position = services.ledger.positionFor(alice.id);
    assert.equal(position.charged, 3600);
    assert.equal(position.balance, 3600);
    assert.equal(position.status, 'owes');
  });

  test('a part payment reduces the debt without settling it', async () => {
    const { services, coffee, alice } = await createShop();

    await buy(services, alice.id, coffee.id, 3); // 36.00
    await services.ledger.recordPayment({ customerId: alice.id, amount: '20.00' });

    const position = services.ledger.positionFor(alice.id);
    assert.equal(position.paid, 2000);
    assert.equal(position.balance, 1600);
    assert.equal(position.status, 'owes');
  });

  test('paying the exact balance settles the account', async () => {
    const { services, coffee, alice } = await createShop();

    await buy(services, alice.id, coffee.id, 3);
    await services.ledger.recordPayment({ customerId: alice.id, amount: '36.00' });

    assert.equal(services.ledger.positionFor(alice.id).balance, 0);
    assert.equal(services.ledger.positionFor(alice.id).status, 'settled');
  });

  test('paying too much shows as credit, not as an error', async () => {
    const { services, coffee, alice } = await createShop();

    await buy(services, alice.id, coffee.id, 1); // 12.00
    await services.ledger.recordPayment({ customerId: alice.id, amount: '50.00' });

    const position = services.ledger.positionFor(alice.id);
    assert.equal(position.balance, -3800);
    assert.equal(position.status, 'credit');
  });

  test('payments are not tied to particular sales, so order does not matter', async () => {
    const { services, coffee, alice } = await createShop();

    await services.ledger.recordPayment({ customerId: alice.id, amount: '30.00' });
    await buy(services, alice.id, coffee.id, 1);

    assert.equal(services.ledger.positionFor(alice.id).balance, -1800);
  });

  test('one account never touches another', async () => {
    const { services, coffee, alice, bob } = await createShop();

    await buy(services, alice.id, coffee.id, 2);
    await services.ledger.recordPayment({ customerId: bob.id, amount: '5.00' });

    assert.equal(services.ledger.positionFor(alice.id).balance, 2400);
    assert.equal(services.ledger.positionFor(bob.id).balance, -500);
  });

  test('refuses a payment from an unknown customer or of a silly amount', async () => {
    const { services, alice } = await createShop();

    await assert.rejects(
      () => services.ledger.recordPayment({ customerId: 'nobody', amount: '5.00' }),
      /customer no longer exists/i
    );
    await assert.rejects(() => services.ledger.recordPayment({ customerId: alice.id, amount: '-5' }), /number/i);
    await assert.rejects(() => services.ledger.recordPayment({ customerId: alice.id, amount: '' }), /enter amount/i);
  });

  test('deleting a payment puts the debt back', async () => {
    const { services, coffee, alice } = await createShop();

    await buy(services, alice.id, coffee.id, 2);
    const payment = await services.ledger.recordPayment({ customerId: alice.id, amount: '24.00' });
    assert.equal(services.ledger.positionFor(alice.id).balance, 0);

    await services.ledger.removePayment(payment.id);
    assert.equal(services.ledger.positionFor(alice.id).balance, 2400);
  });
});

describe('customer statement', () => {
  test('lists sales and payments on one timeline, newest first, with a running balance', async () => {
    const { services, coffee, alice } = await createShop();

    await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 1 }],
      at: '2026-03-01',
    });
    await services.ledger.recordPayment({ customerId: alice.id, amount: '5.00', at: '2026-03-05' });
    await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 2 }],
      at: '2026-03-10',
    });

    const statement = services.ledger.statement(alice.id);

    assert.equal(statement.customer.name, 'Alice');
    assert.equal(statement.charged, 3600);
    assert.equal(statement.paid, 500);
    assert.equal(statement.balance, 3100);

    assert.deepEqual(
      statement.entries.map((entry) => [entry.kind, entry.amount, entry.balanceAfter]),
      [
        ['sale', 2400, 3100],
        ['payment', 500, 700],
        ['sale', 1200, 1200],
      ]
    );
  });

  test('a day given without a time stays on that day', async () => {
    const { services, coffee, alice } = await createShop();

    const { sale } = await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 1 }],
      at: '2026-03-01',
    });

    assert.equal(new Date(sale.at).getDate(), 1);
    assert.equal(new Date(sale.at).getMonth(), 2);
  });
});

describe('shop-wide totals', () => {
  test('separates money owed to the shop from money paid ahead', async () => {
    const { services, coffee, alice, bob } = await createShop();

    await buy(services, alice.id, coffee.id, 5); // Alice owes 60.00
    await buy(services, bob.id, coffee.id, 1); // Bob owes 12.00
    await services.ledger.recordPayment({ customerId: bob.id, amount: '20.00' }); // now 8.00 ahead

    assert.deepEqual(services.ledger.totals(), { receivable: 6000, credit: 800 });
  });

  test('the customer list arrives with balances attached', async () => {
    const { services, coffee, alice } = await createShop();

    await buy(services, alice.id, coffee.id, 1);
    const listed = services.ledger.customerPositions();

    assert.equal(listed.length, 2);
    assert.equal(listed.find((customer) => customer.id === alice.id).balance, 1200);
    assert.equal(listed.find((customer) => customer.id === alice.id).status, 'owes');
  });
});
