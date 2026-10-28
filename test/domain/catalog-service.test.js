'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { createFixture } = require('../support/fixture');

/**
 * The product list. The price here is a default, not a fixed price — what
 * something actually sold for belongs to the sale — and products are hidden
 * rather than deleted, because past sales refer to them.
 */
describe('the product list', () => {
  const shop = () => createFixture().services;

  test('a new product takes a sensible shape', async () => {
    const { catalog } = shop();
    const product = await catalog.create({ name: '  Coffee beans ', unit: 'kg', price: '12.50' });

    assert.equal(product.name, 'Coffee beans', 'trimmed');
    assert.equal(product.unit, 'kg');
    assert.equal(product.price, 1250, 'held in cents');
    assert.equal(product.archived, false);
    assert.ok(product.id);
    assert.ok(product.createdAt);
  });

  test('a unit and a price are optional, and default sensibly', async () => {
    const { catalog } = shop();
    const product = await catalog.create({ name: 'Napkins' });

    assert.equal(product.unit, 'pcs');
    assert.equal(product.price, 0, 'free until priced, rather than refused');
  });

  test('refuses a product with no name', async () => {
    const { catalog } = shop();

    await assert.rejects(() => catalog.create({ name: '   ' }), /Enter a product name/);
    await assert.rejects(() => catalog.create({}), /Enter a product name/);
  });

  test('refuses a price that is not a price', async () => {
    const { catalog } = shop();

    await assert.rejects(() => catalog.create({ name: 'Tea', price: '-1' }), /must be a number/);
    await assert.rejects(() => catalog.create({ name: 'Tea', price: '1.234' }), /decimal places/);
  });

  test('refuses a duplicate name, whatever the casing or spacing', async () => {
    const { catalog } = shop();
    await catalog.create({ name: 'Coffee beans' });

    for (const clash of ['Coffee beans', 'coffee BEANS', '  coffee beans  ']) {
      await assert.rejects(() => catalog.create({ name: clash }), (error) => {
        assert.match(error.message, /already in your products/);
        assert.equal(error.status, 409);
        return true;
      });
    }
  });

  test('a hidden product frees its name again', async () => {
    const { catalog } = shop();
    const first = await catalog.create({ name: 'Coffee beans' });

    await catalog.archive(first.id);
    const second = await catalog.create({ name: 'Coffee beans' });

    assert.notEqual(second.id, first.id);
  });

  test('renaming checks the same, but not against itself', async () => {
    const { catalog } = shop();
    const coffee = await catalog.create({ name: 'Coffee beans' });
    await catalog.create({ name: 'Paper cups' });

    await assert.rejects(() => catalog.update(coffee.id, { name: 'Paper cups' }), /already in your products/);

    // Re-saving a product under its own name is not a clash.
    const same = await catalog.update(coffee.id, { name: 'Coffee beans' });
    assert.equal(same.name, 'Coffee beans');
  });

  test('an update changes only what it was given', async () => {
    const { catalog } = shop();
    const product = await catalog.create({ name: 'Coffee beans', unit: 'kg', price: '12.00' });

    const updated = await catalog.update(product.id, { price: '13.50' });

    assert.equal(updated.price, 1350);
    assert.equal(updated.name, 'Coffee beans');
    assert.equal(updated.unit, 'kg');
    assert.ok(updated.updatedAt);
  });

  test('hidden products leave the list but stay reachable', async () => {
    const { catalog } = shop();
    const product = await catalog.create({ name: 'Coffee beans' });

    await catalog.archive(product.id);

    assert.deepEqual(catalog.list(), [], 'gone from the sell and stock screens');
    assert.equal(catalog.list({ includeArchived: true }).length, 1);
    assert.equal(catalog.get(product.id).name, 'Coffee beans', 'so old sales still read correctly');

    await catalog.restore(product.id);
    assert.equal(catalog.list().length, 1);
  });

  test('the list is alphabetical, ignoring case', async () => {
    const { catalog } = shop();
    for (const name of ['milk', 'Apples', 'bread', 'Cups']) await catalog.create({ name });

    assert.deepEqual(catalog.list().map((p) => p.name), ['Apples', 'bread', 'Cups', 'milk']);
  });

  test('asking for a product that is not there is refused, not guessed', async () => {
    const { catalog } = shop();

    assert.throws(() => catalog.get('ghost'), /That product no longer exists/);
    await assert.rejects(() => catalog.update('ghost', { name: 'x' }), /no longer exists/);
  });
});
