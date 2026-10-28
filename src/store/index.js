'use strict';

/**
 * Storage boundary.
 *
 * The persistence backend is deliberately not chosen yet. Everything above this
 * module talks only to the interface below, so swapping the adapter is a
 * one-line change in `pick()`.
 *
 * An adapter must provide:
 *   describe()                        -> { adapter, location }
 *   read(collection)                  -> Promise<object[]>
 *   insert(collection, record)        -> Promise<object>   (assigns id, createdAt)
 *   update(collection, id, changes)   -> Promise<object>
 *   remove(collection, id)            -> Promise<boolean>
 *   flush()                           -> Promise<void>     (durability barrier)
 */

const memory = require('./memory');

function pick() {
  // TODO: replace with the JSON-file or node:sqlite adapter once decided.
  return memory;
}

const adapter = pick();

module.exports = {
  describe: () => adapter.describe(),
  read: (...args) => adapter.read(...args),
  insert: (...args) => adapter.insert(...args),
  update: (...args) => adapter.update(...args),
  remove: (...args) => adapter.remove(...args),
  flush: (...args) => adapter.flush(...args),
};
