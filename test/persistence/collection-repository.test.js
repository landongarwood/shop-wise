'use strict';

const assert = require('node:assert/strict');
const { test, describe, beforeEach } = require('node:test');

const { CollectionRepository } = require('../../src/persistence/collection-repository');
const { InMemoryStore } = require('../support/in-memory-store');

/**
 * Repositories store and fetch whole records and know none of the shop's
 * rules. What is worth pinning down is the boundary itself: that a missing
 * record is refused rather than returned as undefined, that an id cannot be
 * overwritten, and that reads do not hand out a mutable view of the document.
 */
describe('a collection repository', () => {
  let store;
  let products;

  beforeEach(() => {
    store = new InMemoryStore();
    products = new CollectionRepository({ store, collection: 'products', label: 'product' });
  });

  test('starts empty', () => {
    assert.deepEqual(products.all(), []);
    assert.equal(products.find('nobody'), null);
    assert.equal(products.exists('nobody'), false);
  });

  test('stores a record and finds it again', async () => {
    const added = await products.add({ id: 'p1', name: 'Coffee' });

    assert.deepEqual(added, { id: 'p1', name: 'Coffee' });
    assert.deepEqual(products.all(), [{ id: 'p1', name: 'Coffee' }]);
    assert.equal(products.find('p1').name, 'Coffee');
    assert.equal(products.exists('p1'), true);
  });

  test('get refuses a missing record, naming what was looked for', () => {
    assert.throws(() => products.get('ghost'), (error) => {
      assert.match(error.message, /That product no longer exists/);
      assert.equal(error.status, 404);
      assert.equal(error.expose, true, 'safe to show the shopkeeper');
      return true;
    });
  });

  test('patch merges, leaving untouched fields alone', async () => {
    await products.add({ id: 'p1', name: 'Coffee', unit: 'kg', price: 1200 });
    const updated = await products.patch('p1', { price: 1300 });

    assert.deepEqual(updated, { id: 'p1', name: 'Coffee', unit: 'kg', price: 1300 });
  });

  test('patch cannot change an id', async () => {
    await products.add({ id: 'p1', name: 'Coffee' });
    const updated = await products.patch('p1', { id: 'something-else', name: 'Tea' });

    assert.equal(updated.id, 'p1');
    assert.equal(products.all().length, 1);
  });

  test('patching a missing record is refused', async () => {
    await assert.rejects(() => products.patch('ghost', { name: 'x' }), /no longer exists/);
  });

  test('remove reports whether there was anything to remove', async () => {
    await products.add({ id: 'p1' });

    assert.equal(await products.remove('p1'), true);
    assert.equal(await products.remove('p1'), false, 'removing twice is not an error');
    assert.deepEqual(products.all(), []);
  });

  test('two repositories over one store stay out of each other', async () => {
    const customers = new CollectionRepository({ store, collection: 'customers', label: 'customer' });

    await products.add({ id: 'p1' });
    await customers.add({ id: 'c1' });

    assert.deepEqual(products.all().map((r) => r.id), ['p1']);
    assert.deepEqual(customers.all().map((r) => r.id), ['c1']);
    assert.throws(() => customers.get('p1'), /customer no longer exists/);
  });

  test('every write goes through the store, so nothing bypasses persistence', async () => {
    await products.add({ id: 'p1' });
    await products.patch('p1', { name: 'Coffee' });
    await products.remove('p1');

    assert.equal(store.writes, 3);
  });
});
