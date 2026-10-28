'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { createShop } = require('../support/fixture');

/**
 * Deleting, which never destroys anything.
 *
 * A shopkeeper mis-keys a sale or a payment regularly and has no other way to
 * put it right, so deleting has to be easy. But the books are a record of what
 * happened, and a line that silently vanishes leaves the shopkeeper wondering
 * whether they imagined it. So a deleted record stops counting everywhere,
 * stays visible wherever history is shown, and can be brought back.
 *
 * The rule lives in one place — CollectionRepository.all() leaves deleted
 * records out — and this is where that rule is held to account across the
 * services that depend on it.
 */

const sell = (services, customerId, productId, quantity) =>
  services.sales.record({ customerId, items: [{ productId, quantity }] });

describe('deleting a delivery', () => {
  const stockOf = async (services, productId) =>
    (await services.inventory.levels()).find((row) => row.id === productId).onHand;

  test('takes it back off the shelf', async () => {
    const { services, coffee } = await createShop();
    const entry = await services.inventory.addStock({ productId: coffee.id, quantity: 5 });
    assert.equal(await stockOf(services, coffee.id), 25);

    await services.inventory.removeStockEntry(entry.id);

    assert.equal(await stockOf(services, coffee.id), 20);
  });

  test('but leaves it on the product history, marked', async () => {
    const { services, coffee } = await createShop();
    const entry = await services.inventory.addStock({ productId: coffee.id, quantity: 5 });

    await services.inventory.removeStockEntry(entry.id);
    const history = services.inventory.movementsFor(coffee.id);

    assert.equal(history.total, 2, 'the opening stock and the deleted delivery');
    const row = history.entries.find((movement) => movement.id === entry.id);
    assert.ok(row, 'the deleted delivery is still listed');
    assert.ok(row.deletedAt);
  });

  test('a delivery that never existed cannot be deleted', async () => {
    const { services } = await createShop();

    await assert.rejects(() => services.inventory.removeStockEntry('ghost'), /no longer exists/);
  });
});

describe('deleting a sale', () => {
  test('puts the stock back and drops the debt', async () => {
    const { services, coffee, alice } = await createShop();
    const { sale } = await sell(services, alice.id, coffee.id, 3);
    assert.equal(services.ledger.positionFor(alice.id).balance, 3600);

    await services.sales.remove(sale.id);

    assert.equal(services.ledger.positionFor(alice.id).balance, 0);
    assert.equal(services.inventory.movementTotals().get(coffee.id).onHand, 20);
  });

  test('leaves it on the customer history, counting for nothing', async () => {
    const { services, coffee, alice } = await createShop();
    const { sale } = await sell(services, alice.id, coffee.id, 3);

    await services.sales.remove(sale.id);
    const statement = services.ledger.statement(alice.id);

    assert.equal(statement.entries.length, 1);
    assert.equal(statement.entries[0].id, sale.id);
    assert.ok(statement.entries[0].deletedAt);
    assert.equal(statement.entries[0].balanceAfter, 0, 'the balance walks straight past it');
    assert.equal(statement.balance, 0);
  });

  test('leaves it on the product history too', async () => {
    const { services, coffee, alice } = await createShop();
    const { sale } = await sell(services, alice.id, coffee.id, 3);

    await services.sales.remove(sale.id);
    const sold = services.inventory.movementsFor(coffee.id).entries.find((row) => row.kind === 'sold');

    assert.ok(sold);
    assert.ok(sold.deletedAt);
  });

  test('takes it out of the sales list, though the sale is still there', async () => {
    const { services, coffee, alice } = await createShop();
    const { sale } = await sell(services, alice.id, coffee.id, 3);

    await services.sales.remove(sale.id);

    assert.deepEqual(services.sales.list(), []);
    assert.equal(services.sales.get(sale.id).id, sale.id);
  });
});

describe('deleting a payment', () => {
  test('puts the debt back and stays on the history', async () => {
    const { services, coffee, alice } = await createShop();
    await sell(services, alice.id, coffee.id, 1);
    const payment = await services.ledger.recordPayment({ customerId: alice.id, amount: '5.00' });
    assert.equal(services.ledger.positionFor(alice.id).balance, 700);

    await services.ledger.removePayment(payment.id);

    assert.equal(services.ledger.positionFor(alice.id).balance, 1200);
    assert.equal(services.ledger.paymentsList().length, 0);

    const statement = services.ledger.statement(alice.id);
    assert.equal(statement.entries.length, 2, 'the sale and the deleted payment');
    assert.ok(statement.entries.find((entry) => entry.id === payment.id).deletedAt);
  });

  test('a deleted payment is not a visit either', async () => {
    const { services, alice } = await createShop();
    const payment = await services.ledger.recordPayment({ customerId: alice.id, amount: '5.00', at: '2026-03-04' });

    await services.ledger.removePayment(payment.id);

    assert.equal(services.ledger.positionFor(alice.id).lastVisit, null);
  });
});

describe('deleted records in the reports and on the home screen', () => {
  test('a deleted line is listed but adds up to nothing', async () => {
    const { services, coffee, alice } = await createShop();
    await sell(services, alice.id, coffee.id, 1);
    const { sale } = await sell(services, alice.id, coffee.id, 2);

    await services.sales.remove(sale.id);
    const report = services.reports.sales({ preset: 'all' });

    assert.equal(report.lines.length, 2, 'both lines are shown');
    assert.equal(report.totals.lineCount, 1, 'one of them counts');
    assert.equal(report.totals.deletedCount, 1);
    assert.equal(report.totals.salesTotal, 1200, 'the deleted 24.00 is left out');
    assert.equal(report.totals.itemCount, 1);
    assert.ok(report.lines.find((line) => line.saleId === sale.id).deletedAt);
  });

  test('a deleted payment is not in the period total', async () => {
    const { services, alice } = await createShop();
    const payment = await services.ledger.recordPayment({ customerId: alice.id, amount: '20.00' });

    await services.ledger.removePayment(payment.id);
    const report = services.reports.sales({ preset: 'all' });

    assert.equal(report.totals.paymentsCount, 0);
    assert.equal(report.totals.paymentsTotal, 0);
  });

  test('a product whose only line was deleted is not offered as a filter', async () => {
    const { services, cups, alice } = await createShop();
    const { sale } = await sell(services, alice.id, cups.id, 10);

    await services.sales.remove(sale.id);
    const report = services.reports.sales({ preset: 'all' });

    assert.deepEqual(report.options.products, []);
    assert.equal(report.lines.length, 1, 'the line is still on the table');
  });

  test('takings for today drop when a sale or a payment is deleted', async () => {
    const { services, coffee, alice } = await createShop();
    const { sale } = await sell(services, alice.id, coffee.id, 2);
    const payment = await services.ledger.recordPayment({ customerId: alice.id, amount: '10.00' });

    const before = services.overview.summary();
    assert.equal(before.today.salesTotal, 2400);
    assert.equal(before.today.paymentsTotal, 1000);

    await services.sales.remove(sale.id);
    await services.ledger.removePayment(payment.id);

    const after = services.overview.summary();
    assert.equal(after.today.salesTotal, 0);
    assert.equal(after.today.salesCount, 0);
    assert.equal(after.today.paymentsTotal, 0);
    assert.equal(after.ledger.receivable, 0);
  });
});
