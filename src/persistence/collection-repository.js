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

  /**
   * Everything that counts: deleted records are left out.
   *
   * Deleting here is marking, not erasing — a mis-keyed sale has to stop
   * affecting the books without disappearing from them. Every calculation in
   * the app reads this method, so leaving the deleted ones out once, here, is
   * what makes that true everywhere rather than in each place that remembers.
   */
  all() {
    return this.withDeleted().filter((record) => !record.deletedAt);
  }

  /** Including the deleted ones, for the screens that show what happened. */
  withDeleted() {
    return this.store.read()[this.collection];
  }

  /** Finds by id whether or not it has been deleted: it is still a record. */
  find(id) {
    return this.withDeleted().find((record) => record.id === id) ?? null;
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

  /**
   * Stores several records in one write, so a delivery of twelve products is
   * one entry in the file rather than twelve, and cannot be half-saved.
   */
  async addMany(records) {
    if (!records.length) return [];

    return this.store.mutate((draft) => {
      draft[this.collection].push(...records);
      return records;
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

  /**
   * Marks a record deleted. It stays in the file and on the screens that show
   * history; it simply stops counting.
   */
  async softDelete(id, at) {
    return this.patch(id, { deletedAt: at });
  }
}

module.exports = { CollectionRepository };
