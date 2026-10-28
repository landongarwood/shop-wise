'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { createShop } = require('../support/fixture');

describe('recording a sale', () => {
  test('uses the product price when none is given', async () => {
    const { services, coffee, alice } = await createShop();

    const { sale } = await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 2 }],
    });

    assert.equal(sale.items[0].unitPrice, 1200);
    assert.equal(sale.items[0].lineTotal, 2400);
    assert.equal(sale.total, 2400);
  });

  test('accepts a different price for this sale without changing the product', async () => {
    const { services, coffee, alice } = await createShop();

    const { sale } = await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 2, unitPrice: '11.50' }],
    });

    assert.equal(sale.items[0].unitPrice, 1150);
    assert.equal(sale.total, 2300);
    assert.equal(services.catalog.get(coffee.id).price, 1200, 'the usual price must be untouched');
  });

  test('a price of zero is honoured rather than treated as missing', async () => {
    const { services, cups, alice } = await createShop();

    const { sale } = await services.sales.record({
      customerId: alice.id,
      items: [{ productId: cups.id, quantity: 10, unitPrice: 0 }],
    });

    assert.equal(sale.total, 0);
  });

  test('handles fractional quantities for goods sold by weight', async () => {
    const { services, coffee, alice } = await createShop();

    const { sale } = await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 1.5 }],
    });

    assert.equal(sale.total, 1800);
  });

  test('adds up several lines', async () => {
    const { services, coffee, cups, alice } = await createShop();

    const { sale } = await services.sales.record({
      customerId: alice.id,
      items: [
        { productId: coffee.id, quantity: 2 },
        { productId: cups.id, quantity: 100 },
      ],
    });

    assert.equal(sale.total, 2400 + 1500);
  });

  test('keeps the product name as it was, so history does not change later', async () => {
    const { services, coffee, alice } = await createShop();

    const { sale } = await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 1 }],
    });
    await services.catalog.update(coffee.id, { name: 'Arabica beans' });

    assert.equal(services.sales.get(sale.id).items[0].productName, 'Coffee beans');
    assert.equal(services.catalog.get(coffee.id).name, 'Arabica beans');
  });

  test('warns about selling more than is in stock but still records it', async () => {
    const { services, coffee, alice } = await createShop();

    const { sale, warnings } = await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 50 }],
    });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /Only 20 kg of Coffee beans/);
    assert.equal(services.sales.get(sale.id).total, 60000, 'the sale is still recorded');
    assert.equal(services.inventory.onHand(coffee.id), -30);
  });

  test('says nothing when there is enough stock', async () => {
    const { services, coffee, alice } = await createShop();

    const { warnings } = await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 20 }],
    });

    assert.deepEqual(warnings, []);
  });

  test('refuses sales that make no sense', async () => {
    const { services, coffee, alice } = await createShop();

    await assert.rejects(() => services.sales.record({ customerId: alice.id, items: [] }), /at least 1 product/i);
    await assert.rejects(
      () => services.sales.record({ customerId: 'nobody', items: [{ productId: coffee.id, quantity: 1 }] }),
      /customer no longer exists/i
    );
    await assert.rejects(
      () => services.sales.record({ customerId: alice.id, items: [{ productId: coffee.id, quantity: 0 }] }),
      /more than zero/i
    );
    await assert.rejects(
      () => services.sales.record({ customerId: alice.id, items: [{ productId: 'ghost', quantity: 1 }] }),
      /product no longer exists/i
    );
  });

  test('deleting a mis-keyed sale undoes its effect on stock and balance', async () => {
    const { services, coffee, alice } = await createShop();

    const { sale } = await services.sales.record({
      customerId: alice.id,
      items: [{ productId: coffee.id, quantity: 5 }],
    });
    assert.equal(services.inventory.onHand(coffee.id), 15);

    await services.sales.remove(sale.id);

    assert.equal(services.inventory.onHand(coffee.id), 20);
    assert.equal(services.ledger.positionFor(alice.id).balance, 0);
  });

  test('a rejected sale leaves nothing behind', async () => {
    const { services, coffee, alice } = await createShop();

    await assert.rejects(() =>
      services.sales.record({
        customerId: alice.id,
        items: [
          { productId: coffee.id, quantity: 1 },
          { productId: coffee.id, quantity: -1 },
        ],
      })
    );

    assert.equal(services.sales.list().length, 0);
    assert.equal(services.inventory.onHand(coffee.id), 20);
  });
});
