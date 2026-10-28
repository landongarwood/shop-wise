'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { createFixture, createShop } = require('../support/fixture');

/**
 * The home screen's figures, and the two settings behind them.
 *
 * The clock is fixed at 15 March 2026 in these fixtures, so "today" and "this
 * month" are known quantities and the local-day boundaries can be checked
 * rather than assumed.
 */
describe('the overview', () => {
  test('an empty shop reports zeroes, not blanks', async () => {
    const { services } = createFixture();
    const summary = services.overview.summary();

    assert.deepEqual(summary.today, { salesCount: 0, salesTotal: 0, paymentsCount: 0, paymentsTotal: 0 });
    assert.deepEqual(summary.ledger, { receivable: 0, credit: 0 });
    assert.deepEqual(summary.counts, { products: 0, customers: 0 });
    assert.deepEqual(summary.lowStock, []);
  });

  test("counts today's sales and payments, and no others", async () => {
    const { services, coffee, alice } = await createShop();

    await services.sales.record({ customerId: alice.id, items: [{ productId: coffee.id, quantity: 2 }] }); // today
    await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 1 }],
      at: '2026-03-14', // yesterday
    });
    await services.ledger.recordPayment({ customerId: alice.id, amount: '5.00' });
    await services.ledger.recordPayment({ customerId: alice.id, amount: '9.00', at: '2026-02-20' });

    const summary = services.overview.summary();

    assert.equal(summary.today.salesCount, 1);
    assert.equal(summary.today.salesTotal, 2400);
    assert.equal(summary.today.paymentsCount, 1);
    assert.equal(summary.today.paymentsTotal, 500);
  });

  test('this month takes in the earlier days but not last month', async () => {
    const { services, coffee, alice } = await createShop();

    await services.sales.record({ customerId: alice.id, items: [{ productId: coffee.id, quantity: 2 }] });
    await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 1 }],
      at: '2026-03-02',
    });
    await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 1 }],
      at: '2026-02-27',
    });

    assert.equal(services.overview.summary().month.salesCount, 2);
    assert.equal(services.overview.summary().month.salesTotal, 3600);
  });

  test('a sale late in the evening still belongs to that day', async () => {
    const { services, coffee, alice } = await createShop();

    // Local 23:30 on the 15th. Counted by UTC this could land on the 16th.
    const lateToday = new Date(2026, 2, 15, 23, 30).toISOString();
    await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 1 }],
      at: lateToday,
    });

    assert.equal(services.overview.summary().today.salesCount, 1);
  });

  test('separates money owed from money paid ahead', async () => {
    const { services, coffee, alice, bob } = await createShop();

    await services.sales.record({ customerId: alice.id, items: [{ productId: coffee.id, quantity: 2 }] });
    await services.ledger.recordPayment({ customerId: bob.id, amount: '7.00' });

    assert.deepEqual(services.overview.summary().ledger, { receivable: 2400, credit: 700 });
  });

  test('lists what is running low, and nothing else', async () => {
    const { services, coffee, cups } = await createShop();

    await services.settings.update({ lowStockAt: 20 });
    const summary = services.overview.summary();

    assert.deepEqual(summary.lowStock.map((p) => p.id), [coffee.id], 'coffee has exactly 20; cups have 500');
    assert.deepEqual(Object.keys(summary.lowStock[0]).sort(), ['id', 'name', 'onHand', 'unit']);
    assert.notEqual(summary.lowStock[0].id, cups.id);
  });

  test('counts only the products and customers still in use', async () => {
    const { services, cups, bob } = await createShop();

    await services.catalog.archive(cups.id);
    await services.customers.archive(bob.id);

    assert.deepEqual(services.overview.summary().counts, { products: 1, customers: 1 });
  });

  test('carries the settings, so the screen can format money', async () => {
    const { services } = await createShop();
    await services.settings.update({ currency: '$' });

    assert.equal(services.overview.summary().settings.currency, '$');
  });
});

describe('settings', () => {
  test('start at the defaults', async () => {
    const { services } = createFixture();

    assert.equal(services.settings.get().currency, '¥');
    assert.equal(services.settings.get().lowStockAt, 5);
  });

  test('change only what is passed', async () => {
    const { services } = createFixture();

    await services.settings.update({ currency: '$' });
    assert.equal(services.settings.get().currency, '$');
    assert.equal(services.settings.get().lowStockAt, 5, 'untouched');

    await services.settings.update({ lowStockAt: 12 });
    assert.equal(services.settings.get().currency, '$', 'still untouched');
    assert.equal(services.settings.get().lowStockAt, 12);
  });

  test('are written through the store, so they survive a restart', async () => {
    const container = createFixture();
    await container.services.settings.update({ lowStockAt: 3 });

    assert.equal(container.store.read().settings.lowStockAt, 3);
    assert.ok(container.services.settings.get().updatedAt);
  });

  test('refuse values that would make the app read wrongly', async () => {
    const { services } = createFixture();

    await assert.rejects(() => services.settings.update({ currency: '' }), /Enter a currency symbol/);
    await assert.rejects(() => services.settings.update({ currency: 'far-too-long' }), /too long/);
    await assert.rejects(() => services.settings.update({ lowStockAt: -1 }), /between 0 and/);
    await assert.rejects(() => services.settings.update({ lowStockAt: 1.5 }), /whole number/);
  });

  test('a low-stock level of zero means only out-of-stock counts as low', async () => {
    const { services, coffee, alice } = await createShop();

    await services.settings.update({ lowStockAt: 0 });
    assert.deepEqual(services.inventory.lowStock(), []);

    await services.sales.record({ customerId: alice.id, items: [{ productId: coffee.id, quantity: 20 }] });
    assert.deepEqual(services.inventory.lowStock().map((p) => p.id), [coffee.id]);
  });
});
