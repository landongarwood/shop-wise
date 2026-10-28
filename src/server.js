'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const config = require('./config');
const log = require('./log');
const api = require('./api');

// Even on loopback the server is reachable by any page the user has open, so
// every /api call must carry this token. It is handed to the UI by templating
// it into index.html, which only this server can do.
const sessionToken = crypto.randomBytes(24).toString('hex');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), { 'content-type': MIME['.json'] });
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);

  // Resolve, then confirm the result is still inside uiDir: blocks ../ escapes.
  const target = path.resolve(config.uiDir, rel);
  if (target !== config.uiDir && !target.startsWith(config.uiDir + path.sep)) {
    return send(res, 403, 'Forbidden');
  }

  let stat;
  try {
    stat = await fsp.stat(target);
  } catch {
    return send(res, 404, 'Not found');
  }
  if (!stat.isFile()) return send(res, 404, 'Not found');

  const ext = path.extname(target).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';

  if (ext === '.html') {
    const html = (await fsp.readFile(target, 'utf8'))
      .replaceAll('{{SESSION_TOKEN}}', sessionToken)
      .replaceAll('{{PRODUCT_NAME}}', config.productName)
      .replaceAll('{{VERSION}}', config.version);
    return send(res, 200, html, { 'content-type': type });
  }

  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    // Assets are versioned by the installer, and dev reloads should be live.
    'cache-control': 'no-cache',
  });
  fs.createReadStream(target).pipe(res);
}

async function readBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${config.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, pathname);
  }

  if (req.headers['x-shopwise-token'] !== sessionToken) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendJson(res, err.status || 400, { error: err.message });
  }

  try {
    const result = await api.dispatch({
      method: req.method,
      route: pathname.slice('/api'.length),
      query: url.searchParams,
      body,
    });
    return sendJson(res, result.status, result.payload);
  } catch (err) {
    // Expected client errors (404, validation) are noise at error level.
    const level = err.expose ? 'warn' : 'error';
    log[level](`api ${req.method} ${pathname}`, err.expose ? err.message : err);
    return sendJson(res, err.status || 500, { error: err.expose ? err.message : 'Internal error' });
  }
}

function createServer() {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      log.error('unhandled request error', err);
      if (!res.headersSent) send(res, 500, 'Internal error');
      else res.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => resolve(server));
  });
}

module.exports = { createServer, sessionToken };
