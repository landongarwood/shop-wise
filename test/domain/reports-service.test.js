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

describe('sales report', () => {
  test('covers the asked-for month and nothing either side of it', async () => {
    const { services } = await shopWithSales();
    const report = services.reports.sales({ preset: 'month' });

    assert.equal(report.range.label, 'This month');
    assert.equal(report.totals.salesCount, 2, 'February must be excluded');
    assert.equal(report.totals.salesTotal, 2400 + 1000 + 1500);
    assert.equal(report.totals.paymentsTotal, 2000);
  });

  test('last month is its own period', async () => {
    const { services } = await shopWithSales();
    const report = services.reports.sales({ preset: 'lastMonth' });

    assert.equal(report.totals.salesCount, 1);
    assert.equal(report.totals.salesTotal, 3000);
  });

  test('all time adds everything up', async () => {
    const { services } = await shopWithSales();
    const report = services.reports.sales({ preset: 'all' });

    assert.equal(report.totals.salesCount, 3);
    assert.equal(report.totals.salesTotal, 2400 + 2500 + 3000);
    assert.equal(report.range.from, null);
  });

  test('a custom range includes both end days in full', async () => {
    const { services } = await shopWithSales();

    assert.equal(services.reports.sales({ from: '2026-03-10', to: '2026-03-10' }).totals.salesCount, 1);
    assert.equal(services.reports.sales({ from: '2026-03-02', to: '2026-03-09' }).totals.salesCount, 1);
    assert.equal(services.reports.sales({ from: '2026-03-02', to: '2026-03-10' }).totals.salesCount, 2);
  });

  test('ranks products by the money they brought in', async () => {
    const { services, coffee, cups } = await shopWithSales();
    const report = services.reports.sales({ preset: 'all' });

    assert.deepEqual(
      report.byProduct.map((row) => [row.productName, row.quantity, row.revenue]),
      [
        ['Coffee beans', 3, 3400],
        ['Paper cups', 300, 4500],
      ].sort((a, b) => b[2] - a[2])
    );

    const coffeeRow = report.byProduct.find((row) => row.productId === coffee.id);
    // 2 at 12.00 plus 1 at 10.00 = 34.00 over 3 kg, so 11.33 each on average.
    assert.equal(coffeeRow.revenue, 3400);
    assert.equal(coffeeRow.averagePrice, 1133);

    assert.equal(report.byProduct.find((row) => row.productId === cups.id).quantity, 300);
  });

  test('uses the price each line actually sold at, not the current one', async () => {
    const { services, coffee } = await shopWithSales();

    await services.catalog.update(coffee.id, { price: '99.00' });
    const report = services.reports.sales({ preset: 'all' });

    assert.equal(report.byProduct.find((row) => row.productId === coffee.id).revenue, 3400);
  });

  test('ranks customers by what they bought', async () => {
    const { services, alice } = await shopWithSales();
    const report = services.reports.sales({ preset: 'all' });

    assert.equal(report.byCustomer[0].customerId, alice.id);
    assert.equal(report.byCustomer[0].total, 2400 + 3000);
    assert.equal(report.byCustomer[0].saleCount, 2);
  });

  test('gives one row per active day, oldest first', async () => {
    const { services } = await shopWithSales();
    const report = services.reports.sales({ preset: 'month' });

    assert.deepEqual(
      report.byDay.map((row) => [row.day, row.salesTotal, row.paymentsTotal]),
      [
        ['2026-03-02', 2400, 0],
        ['2026-03-10', 2500, 0],
        ['2026-03-11', 0, 2000],
      ]
    );
  });

  test('counts the units that went out', async () => {
    const { services } = await shopWithSales();

    assert.equal(services.reports.sales({ preset: 'all' }).totals.itemCount, 303);
  });

  test('an empty period reports zeroes rather than failing', async () => {
    const { services } = await shopWithSales();
    const report = services.reports.sales({ from: '2026-01-01', to: '2026-01-31' });

    assert.equal(report.totals.salesCount, 0);
    assert.equal(report.totals.salesTotal, 0);
    assert.deepEqual(report.byProduct, []);
  });

  test('rejects a nonsense period', async () => {
    const { services } = await shopWithSales();

    assert.throws(() => services.reports.sales({ preset: 'fortnight' }), /Unknown period/);
    assert.throws(() => services.reports.sales({ from: '2026-03-10', to: '2026-03-01' }), /ends before it starts/);
    assert.throws(() => services.reports.sales({ from: 'last tuesday' }), /date like/);
    assert.throws(() => services.reports.sales({ from: '2026-02-31' }), /not a real date/);
  });
});
