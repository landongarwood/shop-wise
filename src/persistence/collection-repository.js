'use strict';

const { notFound } = require('../errors');

/**
 * Persistence for one named collection in the document, and nothing more.
 *
 * Repositories do not know the rules of the shop: they store and fetch whole
 * records that a service has already built and validated. That split keeps the
 * business rules testable against a plain fake of this class.
 */
class CollectionRepository {
  /**
   * @param {object} deps
   * @param {{read:Function, mutate:Function}} deps.store
   * @param {string} deps.collection key in the stored document
   * @param {string} deps.label human name used in "not found" messages
   */
  constructor({ store, collection, label = collection }) {
    this.store = store;
    this.collection = collection;
    this.label = label;
  }

  all() {
    return this.store.read()[this.collection];
  }

  find(id) {
    return this.all().find((record) => record.id === id) ?? null;
  }

  /** Like find, but refuses to continue when the record is missing. */
  get(id) {
    const record = this.find(id);
    if (!record) throw notFound(`That ${this.label} no longer exists.`);
    return record;
  }

  exists(id) {
    return this.find(id) !== null;
  }

  async add(record) {
    return this.store.mutate((draft) => {
      draft[this.collection].push(record);
      return record;
    });
  }

  async patch(id, changes) {
    return this.store.mutate((draft) => {
      const rows = draft[this.collection];
      const index = rows.findIndex((record) => record.id === id);
      if (index === -1) throw notFound(`That ${this.label} no longer exists.`);

      rows[index] = { ...rows[index], ...changes, id: rows[index].id };
      return rows[index];
    });
  }

  async remove(id) {
    return this.store.mutate((draft) => {
      const rows = draft[this.collection];
      const index = rows.findIndex((record) => record.id === id);
      if (index === -1) return false;

      rows.splice(index, 1);
      return true;
    });
  }
}

module.exports = { CollectionRepository };
