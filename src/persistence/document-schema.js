'use strict';

/**
 * Shape of the stored document, in one place.
 *
 * Nothing here is a running total. Stock levels and customer balances are
 * always derived from `stockEntries`, `sales` and `payments`, so a stored
 * counter can never disagree with the movements that produced it.
 */

const SCHEMA_VERSION = 1;

const COLLECTIONS = Object.freeze({
  products: 'products',
  customers: 'customers',
  stockEntries: 'stockEntries',
  sales: 'sales',
  payments: 'payments',
});

const DEFAULT_SETTINGS = Object.freeze({
  shopName: 'My Shop',
  currency: '¥',
  lowStockAt: 5,
});

const createEmptyDocument = () => ({
  schemaVersion: SCHEMA_VERSION,
  settings: { ...DEFAULT_SETTINGS },
  products: [],
  customers: [],
  stockEntries: [],
  sales: [],
  payments: [],
});

/**
 * Fills in anything a document written by an older version is missing, so a
 * file from v0.1 still loads in v0.2.
 */
function migrate(loaded) {
  const base = createEmptyDocument();

  return {
    ...base,
    ...loaded,
    schemaVersion: SCHEMA_VERSION,
    settings: { ...base.settings, ...(loaded.settings ?? {}) },
    ...Object.fromEntries(
      Object.keys(COLLECTIONS).map((name) => [name, Array.isArray(loaded[name]) ? loaded[name] : []])
    ),
  };
}

module.exports = { SCHEMA_VERSION, COLLECTIONS, DEFAULT_SETTINGS, createEmptyDocument, migrate };
