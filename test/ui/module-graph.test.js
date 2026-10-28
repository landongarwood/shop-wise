'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, describe, before, after } = require('node:test');

const { createFixture } = require('../support/fixture');
const config = require('../../src/config');

/**
 * The UI ships as plain ES modules with no bundler, so nothing checks that an
 * import path is real until a browser tries to fetch it — at which point the
 * window is blank. These tests walk the whole graph from index.html and insist
 * every file exists on disk and is actually served.
 */
describe('the UI module graph', () => {
  let container;
  let base;

  before(async () => {
    container = createFixture();
    await container.server.listen();
    base = container.server.url.replace(/\/$/, '');
  });

  after(async () => {
    await container.server.close();
  });

  const uiDir = config.uiDir;

  /** Every src/href in index.html, plus every import reachable from them. */
  const collectAssets = () => {
    const html = fs.readFileSync(path.join(uiDir, 'index.html'), 'utf8');

    const entries = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((reference) => reference.startsWith('/'));

    const seen = new Set();
    const queue = [...entries];

    while (queue.length) {
      const reference = queue.shift();
      if (seen.has(reference)) continue;
      seen.add(reference);

      if (!reference.endsWith('.js')) continue;

      const file = path.join(uiDir, reference);
      if (!fs.existsSync(file)) continue;

      const source = fs.readFileSync(file, 'utf8');
      const specifiers = [
        ...source.matchAll(/(?:^|\s)(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g),
        ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
      ].map((match) => match[1]);

      for (const specifier of specifiers) {
        const resolved = specifier.startsWith('/')
          ? specifier
          : `/${path.posix.normalize(path.posix.join(path.posix.dirname(reference), specifier))}`.replace('//', '/');
        queue.push(resolved);
      }
    }

    return [...seen];
  };

  test('index.html references only files that exist', () => {
    const assets = collectAssets();

    assert.ok(assets.length > 15, `expected a real graph, found ${assets.length}`);

    for (const reference of assets) {
      assert.ok(fs.existsSync(path.join(uiDir, reference)), `missing file: ${reference}`);
    }
  });

  test('every module and stylesheet is served with the right content type', async () => {
    for (const reference of collectAssets()) {
      const response = await fetch(`${base}${reference}`);

      assert.equal(response.status, 200, `${reference} returned ${response.status}`);

      const expected = reference.endsWith('.css') ? 'text/css' : 'text/javascript';
      assert.match(response.headers.get('content-type'), new RegExp(expected), `wrong type for ${reference}`);
    }
  });

  test('reaches the screens, widgets and core helpers', () => {
    const assets = collectAssets();

    for (const expected of [
      '/app.js',
      '/core/api-client.js',
      '/core/navigator.js',
      '/screens/index.js',
      '/screens/sell.js',
      '/screens/payment.js',
      '/screens/reports.js',
      '/widgets/forms.js',
      '/widgets/pickers.js',
      '/styles/tokens.css',
    ]) {
      assert.ok(assets.includes(expected), `graph never reached ${expected}`);
    }
  });

  test('no module writes user data through innerHTML', () => {
    // icons.js is the one exception: it assigns literal SVG from its own source.
    const offenders = [];

    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js') && entry.name !== 'icons.js') {
          // Assignments and calls only: the words appear in comments explaining
          // why they are not used.
          if (/\.(?:inner|outer)HTML\s*=|insertAdjacentHTML\s*\(/.test(fs.readFileSync(full, 'utf8'))) {
            offenders.push(path.relative(uiDir, full));
          }
        }
      }
    };
    walk(uiDir);

    assert.deepEqual(offenders, [], 'these modules write markup directly');
  });
});
