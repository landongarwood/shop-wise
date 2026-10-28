'use strict';

const crypto = require('node:crypto');

/**
 * Placeholder adapter: holds records for the lifetime of the process only.
 * Lets the app boot and the API be exercised before the real backend is chosen.
 * Nothing here survives a restart.
 */

const collections = new Map();

const bucket = (name) => {
  if (!collections.has(name)) collections.set(name, []);
  return collections.get(name);
};

module.exports = {
  describe: () => ({ adapter: 'memory', location: null, persistent: false }),

  async read(collection) {
    return bucket(collection).map((record) => ({ ...record }));
  },

  async insert(collection, record) {
    const saved = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...record };
    bucket(collection).push(saved);
    return { ...saved };
  },

  async update(collection, id, changes) {
    const rows = bucket(collection);
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) throw Object.assign(new Error('Record not found'), { status: 404, expose: true });
    rows[index] = { ...rows[index], ...changes, id, updatedAt: new Date().toISOString() };
    return { ...rows[index] };
  },

  async remove(collection, id) {
    const rows = bucket(collection);
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) return false;
    rows.splice(index, 1);
    return true;
  },

  async flush() {},
};
