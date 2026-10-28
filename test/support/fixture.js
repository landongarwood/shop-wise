'use strict';

const { createContainer } = require('../../src/container');
const { FixedClock } = require('../../src/shared/clock');
const { SequentialIds } = require('../../src/shared/ids');
const { InMemoryStore } = require('./in-memory-store');

const silentLogger = { info() {}, warn() {}, error() {} };

/**
 * A whole wired application over an in-memory store, a fixed clock and
 * predictable ids. Because the composition root takes those as parameters,
 * every service can be exercised exactly as it runs in production.
 */
function createFixture({ at = '2026-03-15T10:00:00.000Z' } = {}) {
  return createContainer({
    logger: silentLogger,
    clock: new FixedClock(at),
    ids: new SequentialIds('x'),
    store: new InMemoryStore(),
  });
}

/** Sets up a shop with one product and one customer, both already in stock. */
async function createShop(options = {}) {
  const container = createFixture(options);
  const { catalog, customers, inventory } = container.services;

  const coffee = await catalog.create({ name: 'Coffee beans', unit: 'kg', price: '12.00' });
  const cups = await catalog.create({ name: 'Paper cups', unit: 'pcs', price: '0.15' });
  const alice = await customers.create({ name: 'Alice' });
  const bob = await customers.create({ name: 'Bob' });

  await inventory.addStock({ productId: coffee.id, quantity: 20 });
  await inventory.addStock({ productId: cups.id, quantity: 500 });

  return { ...container, coffee, cups, alice, bob };
}

module.exports = { createFixture, createShop, silentLogger };
