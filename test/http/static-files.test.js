'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, describe, before, after } = require('node:test');

const { StaticFileHandler, MIME_TYPES } = require('../../src/http/static-files');

/**
 * Serving the UI from one directory and nothing outside it.
 *
 * The traversal checks matter more than they look: this process runs with the
 * shopkeeper's own permissions, and the directory above the UI holds the server
 * source and, one level further, their books.
 */
describe('static files', () => {
  let root;
  let outside;
  let handler;

  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'shopwise-static-'));
    fs.mkdirSync(path.join(root, 'ui', 'styles'), { recursive: true });

    fs.writeFileSync(path.join(root, 'ui', 'index.html'), '<title>{{PRODUCT_NAME}}</title><b>{{TOKEN}}</b>');
    fs.writeFileSync(path.join(root, 'ui', 'app.js'), 'export const x = 1;');
    fs.writeFileSync(path.join(root, 'ui', 'styles', 'tokens.css'), ':root{}');
    fs.writeFileSync(path.join(root, 'ui', 'logo.svg'), '<svg/>');

    outside = path.join(root, 'secrets.txt');
    fs.writeFileSync(outside, 'not for the browser');

    handler = new StaticFileHandler({
      rootDir: path.join(root, 'ui'),
      templateValues: () => ({ PRODUCT_NAME: 'ShopWise', TOKEN: 'abc123' }),
    });
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  });

  test('the root path serves index.html', async () => {
    const result = await handler.resolve('/');

    assert.equal(result.status, 200);
    assert.equal(result.type, MIME_TYPES['.html']);
    assert.match(result.body, /<title>ShopWise<\/title>/);
  });

  test('placeholders are filled in, every occurrence of them', async () => {
    fs.writeFileSync(path.join(root, 'ui', 'twice.html'), '{{TOKEN}}/{{TOKEN}}');

    const result = await handler.resolve('/twice.html');

    assert.equal(result.body, 'abc123/abc123');
    assert.ok(!result.body.includes('{{'), 'nothing is left unsubstituted');
  });

  test('other files are streamed with their own type and length', async () => {
    const script = await handler.resolve('/app.js');

    assert.equal(script.status, 200);
    assert.equal(script.type, MIME_TYPES['.js']);
    assert.equal(script.size, fs.statSync(path.join(root, 'ui', 'app.js')).size);
    assert.ok(script.stream, 'handed back as a stream rather than read into memory');
    script.stream.destroy();

    const styles = await handler.resolve('/styles/tokens.css');
    assert.equal(styles.type, MIME_TYPES['.css']);
    styles.stream.destroy();

    const logo = await handler.resolve('/logo.svg');
    assert.equal(logo.type, MIME_TYPES['.svg']);
    logo.stream.destroy();
  });

  test('an unknown extension is served as bytes, not guessed at', async () => {
    fs.writeFileSync(path.join(root, 'ui', 'data.bin'), 'x');
    const result = await handler.resolve('/data.bin');

    assert.equal(result.type, 'application/octet-stream');
    result.stream.destroy();
  });

  test('a missing file is a 404', async () => {
    assert.equal((await handler.resolve('/nope.js')).status, 404);
    assert.equal((await handler.resolve('/styles/nope.css')).status, 404);
  });

  test('a directory is not a file', async () => {
    assert.equal((await handler.resolve('/styles')).status, 404);
  });

  test('refuses to walk out of the UI directory', async () => {
    for (const attempt of [
      '/../secrets.txt',
      '/../../secrets.txt',
      '/styles/../../secrets.txt',
      '/./../secrets.txt',
    ]) {
      const result = await handler.resolve(attempt);
      assert.ok([403, 404].includes(result.status), `${attempt} returned ${result.status}`);
      assert.equal(result.body, undefined, `${attempt} leaked content`);
      assert.equal(result.stream, undefined, `${attempt} leaked a stream`);
    }
  });

  test('an absolute-looking path is still resolved inside the root', async () => {
    // Leading slashes are stripped rather than treated as the filesystem root.
    const result = await handler.resolve('///app.js');

    assert.equal(result.status, 200);
    result.stream.destroy();
  });

  test('template values are read afresh each time', async () => {
    let token = 'first';
    const changing = new StaticFileHandler({
      rootDir: path.join(root, 'ui'),
      templateValues: () => ({ PRODUCT_NAME: 'ShopWise', TOKEN: token }),
    });

    assert.match((await changing.resolve('/')).body, /first/);
    token = 'second';
    assert.match((await changing.resolve('/')).body, /second/);
  });

  test('with no template values, the file is served as written', async () => {
    const plain = new StaticFileHandler({ rootDir: path.join(root, 'ui') });

    assert.match((await plain.resolve('/')).body, /\{\{PRODUCT_NAME\}\}/);
  });
});
