'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

/**
 * Keeps a dated copy of the data file: one per day, taken just before the
 * first write of that day, so the copy is the state the shop closed on.
 *
 * A failed backup is logged but never blocks a sale.
 */
class BackupService {
  constructor({ sourceFile, backupDir, clock, logger, keep = 30 }) {
    this.sourceFile = sourceFile;
    this.backupDir = backupDir;
    this.clock = clock;
    this.logger = logger;
    this.keep = keep;
  }

  async beforeWrite() {
    const target = path.join(this.backupDir, `shop-${this.clock.today()}.json`);

    try {
      if (!fs.existsSync(this.sourceFile) || fs.existsSync(target)) return;

      await fsp.mkdir(this.backupDir, { recursive: true });
      await fsp.copyFile(this.sourceFile, target);
      this.logger.info(`backup written: ${target}`);

      await this.#prune();
    } catch (err) {
      this.logger.warn('backup failed', err);
    }
  }

  async #prune() {
    const names = (await fsp.readdir(this.backupDir))
      .filter((name) => /^shop-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort();

    for (const name of names.slice(0, Math.max(0, names.length - this.keep))) {
      await fsp.rm(path.join(this.backupDir, name), { force: true });
    }
  }
}

module.exports = { BackupService };
