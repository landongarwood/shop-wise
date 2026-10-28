'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, describe, beforeEach, afterEach } = require('node:test');

const { JsonDocumentStore } = require('../../src/persistence/json-document-store');

/**
 * The shop's books live in one file, so this is where losing data would
 * actually happen. The behaviours worth pinning down are the ones that only
 * show up when something goes wrong: a mutation that throws half way, two
 * writes landing at once, a process that dies mid-write, and a file that comes
 * back unreadable.
 */
describe('the JSON document store', () => {
  const silent = { info() {}, warn() {}, error() {} };

  let directory;
  let filePath;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shopwise-store-'));
    filePath = path.join(directory, 'shop.json');
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  });

  const open = (overrides = {}) => new JsonDocumentStore({ filePath, logger: silent, ...overrides });

  test('creates the file on first read, with an empty shop in it', () => {
    const store = open();
    const document = store.read();

    assert.deepEqual(document.products, []);
    assert.ok(fs.existsSync(filePath), 'the file exists before anything is written to it');
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')).products, []);
  });

  test('makes the directory if it is not there yet', () => {
    const nested = path.join(directory, 'a', 'b', 'shop.json');
    new JsonDocumentStore({ filePath: nested, logger: silent }).read();

    assert.ok(fs.existsSync(nested));
  });

  test('a committed change is on disk, not just in memory', async () => {
    const store = open();
    await store.mutate((draft) => draft.products.push({ id: 'p1', name: 'Coffee' }));

    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')).products, [{ id: 'p1', name: 'Coffee' }]);
    assert.deepEqual(open().read().products, [{ id: 'p1', name: 'Coffee' }], 'and survives a reopen');
  });

  test('a mutation that throws leaves nothing behind', async () => {
    const store = open();
    await store.mutate((draft) => draft.products.push({ id: 'p1' }));

    await assert.rejects(() =>
      store.mutate((draft) => {
        draft.products.push({ id: 'p2' });
        draft.customers.push({ id: 'c1' });
        throw new Error('rejected half way');
      })
    );

    assert.deepEqual(store.read().products, [{ id: 'p1' }], 'the half-finished change is gone');
    assert.deepEqual(store.read().customers, []);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')).products, [{ id: 'p1' }]);
  });

  test('the store still works after a failed mutation', async () => {
    const store = open();

    await assert.rejects(() => store.mutate(() => Promise.reject(new Error('no'))));
    await store.mutate((draft) => draft.products.push({ id: 'after' }));

    assert.deepEqual(store.read().products, [{ id: 'after' }], 'the queue did not jam');
  });

  test('the mutator cannot hold on to the committed document', async () => {
    const store = open();
    let escaped;

    await store.mutate((draft) => {
      escaped = draft;
      draft.products.push({ id: 'p1' });
    });

    // Writing to the draft after it was committed must not reach the store.
    escaped.products.push({ id: 'sneaked-in' });
    assert.equal(open().read().products.length, 1, 'only the committed change is on disk');
  });

  test('concurrent mutations are serialised, so none is lost', async () => {
    const store = open();

    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        store.mutate(async (draft) => {
          // Yield in the middle: without serialisation these would interleave
          // and overwrite each other's copies.
          await new Promise((resolve) => setTimeout(resolve, index % 3));
          draft.products.push({ id: `p${index}` });
        })
      )
    );

    assert.equal(store.read().products.length, 25);
    assert.equal(new Set(store.read().products.map((p) => p.id)).size, 25);
    assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8')).products.length, 25);
  });

  test('mutate hands back whatever the change returned', async () => {
    const store = open();
    const result = await store.mutate((draft) => {
      draft.products.push({ id: 'p1' });
      return 'receipt';
    });

    assert.equal(result, 'receipt');
  });

  test('an unreadable file is set aside rather than silently replaced', () => {
    fs.writeFileSync(filePath, '{ this is not json');

    const store = open();
    assert.deepEqual(store.read().products, [], 'the app still starts');

    const quarantined = fs.readdirSync(directory).filter((name) => name.includes('unreadable'));
    assert.equal(quarantined.length, 1, 'the damaged file is kept for recovery');
    assert.equal(fs.readFileSync(path.join(directory, quarantined[0]), 'utf8'), '{ this is not json');
  });

  test('a file from an older version is migrated on load', () => {
    fs.writeFileSync(filePath, JSON.stringify({ products: [{ id: 'p1' }] }));

    const document = open().read();

    assert.deepEqual(document.products, [{ id: 'p1' }]);
    assert.deepEqual(document.payments, [], 'a collection it never had');
    assert.equal(document.settings.currency, '¥');
  });

  test('writes through a temp file, leaving none behind', async () => {
    const store = open();
    await store.mutate((draft) => draft.products.push({ id: 'p1' }));

    assert.deepEqual(
      fs.readdirSync(directory).filter((name) => name.endsWith('.tmp')),
      [],
      'the temp file is renamed, not left'
    );
  });

  test('a torn temp file from a previous crash does not affect the real one', async () => {
    const store = open();
    await store.mutate((draft) => draft.products.push({ id: 'p1' }));

    // What a process killed mid-write would leave behind.
    fs.writeFileSync(`${filePath}.tmp`, '{ half written');

    assert.deepEqual(open().read().products, [{ id: 'p1' }]);
  });

  test('calls the backup policy before each write, never after a failure', async () => {
    const calls = [];
    const store = open({ backups: { beforeWrite: async () => calls.push('backup') } });

    await store.mutate((draft) => draft.products.push({ id: 'p1' }));
    assert.deepEqual(calls, ['backup']);

    await assert.rejects(() =>
      store.mutate(() => {
        throw new Error('no');
      })
    );
    assert.deepEqual(calls, ['backup'], 'a rejected change is not backed up');
  });

  test('describes itself for the settings screen', () => {
    assert.deepEqual(open().describe(), { adapter: 'json', location: filePath, persistent: true });
  });
});
