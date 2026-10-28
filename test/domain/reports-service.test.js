'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { createShop } = require('../support/fixture');

// The fixture's clock is fixed at 15 March 2026, so these dates are stable.
const AT = '2026-03-15T10:00:00.000Z';

async function shopWithSales() {
  const shop = await createShop({ at: AT });
  const { sales, ledger } = shop.services;

  await sales.record({
    customerId: shop.alice.id,
    items: [{ productId: shop.coffee.id, quantity: 2 }], // 24.00
    at: '2026-03-02',
  });
  await sales.record({
    customerId: shop.bob.id,
    items: [
      { productId: shop.coffee.id, quantity: 1, unitPrice: '10.00' }, // sold cheaper
      { productId: shop.cups.id, quantity: 100 }, // 15.00
    ],
    at: '2026-03-10',
  });
  await sales.record({
    customerId: shop.alice.id,
    items: [{ productId: shop.cups.id, quantity: 200 }], // 30.00
    at: '2026-02-20', // last month
  });
  await ledger.recordPayment({ customerId: shop.alice.id, amount: '20.00', at: '2026-03-11' });

  return shop;
}

describe('the sales ledger', () => {
  test('gives one row per line of a sale', async () => {
    const { services } = await shopWithSales();
    const report = services.reports.sales({ preset: 'month' });

    // Two sales this month, but the second had two products on it.
    assert.equal(report.totals.saleCount, 2);
    assert.equal(report.totals.lineCount, 3);
    assert.equal(report.lines.length, 3);
  });

  test('each row carries the product, customer, quantity, price and date', async () => {
    const { services, bob, coffee } = await shopWithSales();
    const report = services.reports.sales({ preset: 'month' });

    const line = report.lines.find((row) => row.customerId === bob.id && row.productId === coffee.id);

    assert.equal(line.productName, 'Coffee beans');
    assert.equal(line.customerName, 'Bob');
    assert.equal(line.quantity, 1);
    assert.equal(line.unit, 'kg');
    assert.equal(line.unitPrice, 1000, 'the price it actually went out at');
    assert.equal(line.lineTotal, 1000);
    assert.equal(line.at.slice(0, 10), '2026-03-10');
  });

  test('rows come back newest first', async () => {
    const { services } = await shopWithSales();
    const days = services.reports.sales({ preset: 'all' }).lines.map((line) => line.at.slice(0, 10));

    assert.deepEqual(days, [...days].sort().reverse());
  });

  test('covers the asked-for period and nothing either side of it', async () => {
    const { services } = await shopWithSales();

    assert.equal(services.reports.sales({ preset: 'month' }).totals.salesTotal, 2400 + 1000 + 1500);
    assert.equal(services.reports.sales({ preset: 'lastMonth' }).totals.salesTotal, 3000);
    assert.equal(services.reports.sales({ preset: 'all' }).totals.lineCount, 4);
  });

  test('a custom range includes both end days in full', async () => {
    const { services } = await shopWithSales();

    assert.equal(services.reports.sales({ from: '2026-03-10', to: '2026-03-10' }).totals.saleCount, 1);
    assert.equal(services.reports.sales({ from: '2026-03-02', to: '2026-03-09' }).totals.saleCount, 1);
    assert.equal(services.reports.sales({ from: '2026-03-02', to: '2026-03-10' }).totals.saleCount, 2);
  });

  test('narrows to one product', async () => {
    const { services, coffee } = await shopWithSales();
    const report = services.reports.sales({ preset: 'all', productId: coffee.id });

    assert.equal(report.totals.lineCount, 2);
    assert.ok(report.lines.every((line) => line.productId === coffee.id));
    assert.equal(report.totals.salesTotal, 2400 + 1000);
    assert.equal(report.totals.itemCount, 3);
  });

  test('narrows to one customer, including every line of their sales', async () => {
    const { services, bob } = await shopWithSales();
    const report = services.reports.sales({ preset: 'all', customerId: bob.id });

    assert.equal(report.totals.lineCount, 2, "both lines of Bob's one sale");
    assert.equal(report.totals.saleCount, 1);
    assert.equal(report.totals.salesTotal, 2500);
  });

  test('narrows to a product and a customer together', async () => {
    const { services, alice, cups } = await shopWithSales();
    const report = services.reports.sales({ preset: 'all', customerId: alice.id, productId: cups.id });

    assert.equal(report.totals.lineCount, 1);
    assert.equal(report.totals.salesTotal, 3000);
  });

  test('offers every product and customer in the period as a filter', async () => {
    const { services } = await shopWithSales();
    const { options } = services.reports.sales({ preset: 'month' });

    assert.deepEqual(
      options.products.map((option) => [option.name, option.count]),
      [
        ['Coffee beans', 2],
        ['Paper cups', 1],
      ]
    );
    assert.deepEqual(
      options.customers.map((option) => [option.name, option.count]),
      [
        ['Alice', 1],
        ['Bob', 2],
      ]
    );
  });

  test('the filter options stay the same when a filter is applied, so it can be changed', async () => {
    const { services, coffee } = await shopWithSales();
    const report = services.reports.sales({ preset: 'month', productId: coffee.id });

    assert.equal(report.options.products.length, 2, 'the other product is still offered');
    assert.equal(report.filters.productId, coffee.id);
  });

  test('uses the price each line actually sold at, not the current one', async () => {
    const { services, coffee } = await shopWithSales();

    await services.catalog.update(coffee.id, { price: '99.00' });
    const report = services.reports.sales({ preset: 'all', productId: coffee.id });

    assert.equal(report.totals.salesTotal, 3400);
  });

  test('payments follow the period and the customer, but not the product', async () => {
    const { services, alice, coffee } = await shopWithSales();

    const everything = services.reports.sales({ preset: 'month' });
    assert.equal(everything.totals.paymentsTotal, 2000);
    assert.equal(everything.totals.paymentsApplyToFilter, true);

    const forAlice = services.reports.sales({ preset: 'month', customerId: alice.id });
    assert.equal(forAlice.totals.paymentsTotal, 2000);

    // A payment is never tied to a product, so the report says so rather than
    // showing a figure that does not match the rows.
    const forCoffee = services.reports.sales({ preset: 'month', productId: coffee.id });
    assert.equal(forCoffee.totals.paymentsApplyToFilter, false);
  });

  test('an empty period reports zeroes rather than failing', async () => {
    const { services } = await shopWithSales();
    const report = services.reports.sales({ from: '2026-01-01', to: '2026-01-31' });

    assert.equal(report.totals.lineCount, 0);
    assert.equal(report.totals.salesTotal, 0);
    assert.deepEqual(report.lines, []);
    assert.deepEqual(report.options.products, []);
  });

  test('caps how many rows come back and says when it did', async () => {
    const shop = await createShop({ at: AT });
    const { sales, inventory } = shop.services;

    await inventory.addStock({ productId: shop.coffee.id, quantity: 1000 });
    for (let i = 0; i < 12; i += 1) {
      await sales.record({ customerId: shop.alice.id, items: [{ productId: shop.coffee.id, quantity: 1 }] });
    }

    const report = shop.services.reports.sales({ preset: 'all', limit: 5 });

    assert.equal(report.lines.length, 5);
    assert.equal(report.totals.lineCount, 12, 'the totals still describe everything');
    assert.equal(report.truncated, true);
  });

  test('rejects a nonsense period', async () => {
    const { services } = await shopWithSales();

    assert.throws(() => services.reports.sales({ preset: 'fortnight' }), /Unknown period/);
    assert.throws(() => services.reports.sales({ from: '2026-03-10', to: '2026-03-01' }), /ends before it starts/);
    assert.throws(() => services.reports.sales({ from: 'last tuesday' }), /date like/);
    assert.throws(() => services.reports.sales({ from: '2026-02-31' }), /not a real date/);
  });
});
