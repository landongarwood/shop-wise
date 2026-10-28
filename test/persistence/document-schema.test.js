'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const {
  SCHEMA_VERSION,
  COLLECTIONS,
  DEFAULT_SETTINGS,
  createEmptyDocument,
  migrate,
} = require('../../src/persistence/document-schema');

/**
 * The shape of what is on disk.
 *
 * `migrate` is the only thing standing between a file written by an older
 * version and a crash, so it is worth pinning down: it has to fill in what is
 * missing without touching what the shopkeeper actually set.
 */
describe('the stored document', () => {
  test('a new shop starts empty, in yuan', () => {
    const document = createEmptyDocument();

    assert.equal(document.settings.currency, '¥');
    assert.equal(document.settings.currency.codePointAt(0), 0xa5, 'the yen/yuan sign, not a mangled byte');
    assert.equal(document.settings.shopName, 'My Shop');
    assert.equal(document.settings.lowStockAt, 5);
    assert.equal(document.schemaVersion, SCHEMA_VERSION);

    for (const collection of Object.keys(COLLECTIONS)) {
      assert.deepEqual(document[collection], [], `${collection} should start empty`);
    }
  });

  test('the defaults cannot be edited by accident', () => {
    assert.throws(() => {
      DEFAULT_SETTINGS.currency = '$';
    }, TypeError);

    // A fresh document gets a copy, so changing one shop never touches the next.
    const first = createEmptyDocument();
    first.settings.currency = '$';
    assert.equal(createEmptyDocument().settings.currency, '¥');
  });

  test('a file from an older version gains what it is missing', () => {
    const old = { settings: { shopName: 'Corner Cafe' }, products: [{ id: 'p1' }] };
    const migrated = migrate(old);

    assert.equal(migrated.settings.shopName, 'Corner Cafe', 'what was set is kept');
    assert.equal(migrated.settings.currency, '¥', 'what was missing is filled in');
    assert.deepEqual(migrated.products, [{ id: 'p1' }], 'records are left alone');
    assert.deepEqual(migrated.payments, [], 'a collection added later arrives empty');
    assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  });

  test('a currency the shopkeeper chose survives migration', () => {
    assert.equal(migrate({ settings: { currency: '$' } }).settings.currency, '$');
  });

  test('a collection stored as something other than a list is replaced', () => {
    // Guards the load path: a truncated or hand-edited file must not crash
    // every screen that iterates it.
    const migrated = migrate({ sales: null, customers: 'oops', payments: undefined });

    assert.deepEqual(migrated.sales, []);
    assert.deepEqual(migrated.customers, []);
    assert.deepEqual(migrated.payments, []);
  });
});
