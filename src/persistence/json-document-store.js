'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { migrate, createEmptyDocument } = require('./document-schema');

/**
 * One JSON document, read synchronously from memory and written atomically.
 *
 * The whole shop fits comfortably in memory, so reads need no I/O and writes
 * replace the file in a single rename. If the data ever outgrows this, the
 * replacement implements the same read/mutate pair and nothing above changes.
 */
class JsonDocumentStore {
  /**
   * @param {object} deps
   * @param {string} deps.filePath
   * @param {{info:Function, warn:Function, error:Function}} deps.logger
   * @param {{beforeWrite?: Function}} [deps.backups] optional backup policy
   */
  constructor({ filePath, logger, backups = null }) {
    this.filePath = filePath;
    this.logger = logger;
    this.backups = backups;

    this.document = null;
    this.queue = Promise.resolve();
  }

  read() {
    if (!this.document) this.document = this.#load();
    return this.document;
  }

  /**
   * Applies `change` to a copy of the document and commits it only if that
   * returns without throwing, so a rejected sale cannot leave half of itself
   * behind. Mutations are serialised: two sales never interleave.
   *
   * @template T
   * @param {(draft: object) => T | Promise<T>} change
   * @returns {Promise<T>}
   */
  mutate(change) {
    const run = this.queue.then(async () => {
      const draft = structuredClone(this.read());
      const result = await change(draft);

      if (this.backups) await this.backups.beforeWrite();
      this.#writeAtomic(draft);
      this.document = draft;

      return result;
    });

    // Keep the queue usable after a failure; callers still see the rejection.
    this.queue = run.then(
      () => undefined,
      () => undefined
    );

    return run;
  }

  describe() {
    return { adapter: 'json', location: this.filePath, persistent: true };
  }

  #load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    if (!fs.existsSync(this.filePath)) {
      const fresh = createEmptyDocument();
      this.#writeAtomic(fresh);
      this.logger.info(`created ${this.filePath}`);
      return fresh;
    }

    try {
      const document = migrate(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
      this.logger.info(
        `loaded ${this.filePath}: ${document.products.length} products, ` +
          `${document.customers.length} customers, ${document.sales.length} sales`
      );
      return document;
    } catch (err) {
      // Never silently start from an empty book. Keep the unreadable file so it
      // can be recovered by hand, and make the failure loud.
      const quarantine = `${this.filePath}.unreadable-${Date.now()}`;
      fs.renameSync(this.filePath, quarantine);
      this.logger.error(`could not parse ${this.filePath}, moved it to ${quarantine}`, err);

      const fresh = createEmptyDocument();
      this.#writeAtomic(fresh);
      return fresh;
    }
  }

  #writeAtomic(document) {
    const temp = `${this.filePath}.tmp`;
    const payload = JSON.stringify(document, null, 2);

    const handle = fs.openSync(temp, 'w');
    try {
      fs.writeFileSync(handle, payload);
      fs.fsyncSync(handle); // the rename is only safe once the bytes are on disk
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temp, this.filePath);
  }
}

module.exports = { JsonDocumentStore };
