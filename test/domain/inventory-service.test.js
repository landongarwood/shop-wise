'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { createShop, createFixture } = require('../support/fixture');

describe('stock', () => {
  test('is the difference between what came in and what went out', async () => {
    const { services, coffee, alice } = await createShop();

    assert.equal(services.inventory.onHand(coffee.id), 20);

    await services.inventory.addStock({ productId: coffee.id, quantity: 5 });
    assert.equal(services.inventory.onHand(coffee.id), 25);

    await services.sales.record({ customerId: alice.id, items: [{ productId: coffee.id, quantity: 3 }] });
    assert.equal(services.inventory.onHand(coffee.id), 22);
  });

  test('stays exact when weights are added and sold repeatedly', async () => {
    const { services, coffee } = await createShop();

    for (let i = 0; i < 10; i += 1) {
      await services.inventory.addStock({ productId: coffee.id, quantity: 0.1 });
    }

    // 20 + (0.1 x 10) must be 21, not 20.999999999999996
    assert.equal(services.inventory.onHand(coffee.id), 21);
  });

  test('a product with no movements reads as zero rather than missing', async () => {
    const container = createFixture();
    const product = await container.services.catalog.create({ name: 'Napkins', price: '1.00' });

    assert.equal(container.services.inventory.onHand(product.id), 0);
    assert.equal(container.services.inventory.levels()[0].onHand, 0);
  });

  test('flags products at or below the low-stock level', async () => {
    const { services, coffee, cups } = await createShop();

    await services.settings.update({ lowStockAt: 20 });
    const low = services.inventory.lowStock().map((product) => product.id);

    assert.ok(low.includes(coffee.id), 'coffee has exactly 20, which counts as low');
    assert.ok(!low.includes(cups.id), 'cups have 500');
  });

  test('levels carry the product details the screens need', async () => {
    const { services, coffee } = await createShop();

    const level = services.inventory.levels().find((product) => product.id === coffee.id);

    assert.equal(level.name, 'Coffee beans');
    assert.equal(level.unit, 'kg');
    assert.equal(level.price, 1200);
    assert.equal(level.added, 20);
    assert.equal(level.sold, 0);
  });

  test('refuses stock for a product that is hidden or unknown', async () => {
    const { services, coffee } = await createShop();

    await services.catalog.archive(coffee.id);
    await assert.rejects(
      () => services.inventory.addStock({ productId: coffee.id, quantity: 1 }),
      /hidden\. Restore it/i
    );
    await assert.rejects(
      () => services.inventory.addStock({ productId: 'ghost', quantity: 1 }),
      /product no longer exists/i
    );
  });

  test('removing a mis-keyed delivery corrects the stock', async () => {
    const { services, coffee } = await createShop();

    const entry = await services.inventory.addStock({ productId: coffee.id, quantity: 100, note: 'typo' });
    assert.equal(services.inventory.onHand(coffee.id), 120);

    await services.inventory.removeStockEntry(entry.id);
    assert.equal(services.inventory.onHand(coffee.id), 20);
  });
});

describe('the product list', () => {
  test('refuses two products with the same name', async () => {
    const { services } = await createShop();

    await assert.rejects(() => services.catalog.create({ name: 'coffee BEANS', price: '1.00' }), /already in your products/i);
  });

  test('hides archived products but keeps them reachable', async () => {
    const { services, cups } = await createShop();

    await services.catalog.archive(cups.id);

    assert.equal(services.catalog.list().length, 1);
    assert.equal(services.catalog.list({ includeArchived: true }).length, 2);
    assert.equal(services.catalog.get(cups.id).name, 'Paper cups');
  });
});
