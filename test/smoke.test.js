'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

process.argv.push('--no-window');

const { createServer, sessionToken } = require('../src/server');

let server;
let base;

test('server starts', async () => {
  server = await createServer();
  base = `http://127.0.0.1:${server.address().port}`;
});

test('serves the UI shell with the session token templated in', async () => {
  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>ShopWise<\/title>/);
  assert.ok(html.includes(sessionToken), 'token should be injected');
  assert.ok(!html.includes('{{'), 'no placeholders should remain');
});

test('rejects API calls without the session token', async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 401);
});

test('answers /api/meta with the token', async () => {
  const response = await fetch(`${base}/api/meta`, { headers: { 'x-shopwise-token': sessionToken } });
  assert.equal(response.status, 200);

  const meta = await response.json();
  assert.equal(meta.product, 'ShopWise');
  assert.ok(meta.version);
  assert.ok(meta.storage.adapter);
});

test('unknown endpoints are 404, not 500', async () => {
  const response = await fetch(`${base}/api/nope`, { headers: { 'x-shopwise-token': sessionToken } });
  assert.equal(response.status, 404);
});

test('refuses to serve files outside the ui folder', async () => {
  const response = await fetch(`${base}/../package.json`);
  assert.ok([403, 404].includes(response.status), `got ${response.status}`);
  server.close();
});
