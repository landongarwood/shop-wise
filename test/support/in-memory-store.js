'use strict';

const { createEmptyDocument } = require('../../src/persistence/document-schema');

/**
 * Stands in for JsonDocumentStore in tests: same read/mutate contract, no disk.
 *
 * It clones on mutate exactly as the real store does, so a test would catch a
 * service that holds on to a stale reference.
 */
class InMemoryStore {
  constructor(document = createEmptyDocument()) {
    this.document = document;
    this.writes = 0;
  }

  read() {
    return this.document;
  }

  async mutate(change) {
    const draft = structuredClone(this.document);
    const result = await change(draft);

    this.document = draft;
    this.writes += 1;
    return result;
  }

  describe() {
    return { adapter: 'in-memory', location: null, persistent: false };
  }
}

module.exports = { InMemoryStore };
