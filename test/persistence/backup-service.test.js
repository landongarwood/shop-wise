'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, describe, beforeEach, afterEach } = require('node:test');

const { BackupService } = require('../../src/persistence/backup-service');
const { FixedClock } = require('../../src/shared/clock');

/**
 * The daily copy is the last line of defence, so the two things that matter
 * are that it happens once a day — not on every sale — and that it can never
 * take a sale down with it when the disk says no.
 */
describe('daily backups', () => {
  const silent = { info() {}, warn() {}, error() {} };

  let directory;
  let sourceFile;
  let backupDir;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shopwise-backup-'));
    sourceFile = path.join(directory, 'shop.json');
    backupDir = path.join(directory, 'backups');
    fs.writeFileSync(sourceFile, '{"products":[]}');
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  });

  const serviceAt = (instant, overrides = {}) =>
    new BackupService({
      sourceFile,
      backupDir,
      clock: new FixedClock(instant),
      logger: silent,
      ...overrides,
    });

  const backups = () => (fs.existsSync(backupDir) ? fs.readdirSync(backupDir).sort() : []);

  test('takes a copy named for the day', async () => {
    await serviceAt('2026-03-15T09:00:00').beforeWrite();

    assert.deepEqual(backups(), ['shop-2026-03-15.json']);
    assert.equal(fs.readFileSync(path.join(backupDir, 'shop-2026-03-15.json'), 'utf8'), '{"products":[]}');
  });

  test('only once a day, however many sales there are', async () => {
    const service = serviceAt('2026-03-15T09:00:00');

    await service.beforeWrite();
    fs.writeFileSync(sourceFile, '{"products":[{"id":"later"}]}');
    await service.beforeWrite();

    assert.deepEqual(backups(), ['shop-2026-03-15.json']);
    assert.equal(
      fs.readFileSync(path.join(backupDir, 'shop-2026-03-15.json'), 'utf8'),
      '{"products":[]}',
      'the copy is the state the day opened on, not the latest write'
    );
  });

  test('a new day gets its own copy', async () => {
    await serviceAt('2026-03-15T09:00:00').beforeWrite();
    await serviceAt('2026-03-16T09:00:00').beforeWrite();

    assert.deepEqual(backups(), ['shop-2026-03-15.json', 'shop-2026-03-16.json']);
  });

  test('keeps the most recent copies and prunes the rest', async () => {
    for (let day = 1; day <= 8; day += 1) {
      await serviceAt(`2026-03-0${day}T09:00:00`, { keep: 5 }).beforeWrite();
    }

    assert.deepEqual(backups(), [
      'shop-2026-03-04.json',
      'shop-2026-03-05.json',
      'shop-2026-03-06.json',
      'shop-2026-03-07.json',
      'shop-2026-03-08.json',
    ]);
  });

  test('leaves anything that is not a dated backup alone', async () => {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, 'notes.txt'), 'mine');
    fs.writeFileSync(path.join(backupDir, 'shop.json.unreadable-123'), 'damaged');

    for (let day = 1; day <= 4; day += 1) {
      await serviceAt(`2026-03-0${day}T09:00:00`, { keep: 1 }).beforeWrite();
    }

    assert.ok(backups().includes('notes.txt'));
    assert.ok(backups().includes('shop.json.unreadable-123'), 'a quarantined file is not a backup to prune');
  });

  test('does nothing when there is no file to copy yet', async () => {
    fs.rmSync(sourceFile);
    await serviceAt('2026-03-15T09:00:00').beforeWrite();

    assert.deepEqual(backups(), []);
  });

  test('a failing backup never takes the write down with it', async () => {
    const warnings = [];
    const service = serviceAt('2026-03-15T09:00:00', {
      // A path that cannot be a directory, which is the realistic failure.
      backupDir: path.join(sourceFile, 'backups'),
      logger: { info() {}, warn: (...args) => warnings.push(args), error() {} },
    });

    await service.beforeWrite(); // must resolve, not throw
    assert.equal(warnings.length, 1, 'it is reported rather than swallowed in silence');
  });
});
