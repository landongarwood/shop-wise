'use strict';

const http = require('node:http');

const { MIME_TYPES } = require('./static-files');

const JSON_TYPE = MIME_TYPES['.json'];
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * The HTTP boundary: translates requests into router calls and errors into
 * status codes. It holds no knowledge of products, customers or money.
 *
 * Everything under /api is guarded by a token minted per run and handed to the
 * page through the HTML template. A server on loopback is otherwise reachable
 * by any site the user happens to have open in a browser.
 */
class HttpServer {
  constructor({ router, staticFiles, sessionToken, logger, devChannel = null, host = '127.0.0.1', port = 0 }) {
    this.router = router;
    this.staticFiles = staticFiles;
    this.sessionToken = sessionToken;
    this.devChannel = devChannel;
    this.logger = logger;
    this.host = host;
    this.port = port;

    this.server = http.createServer((request, response) => this.#handleSafely(request, response));
  }

  listen() {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.port = this.server.address().port;
        resolve(this);
      });
    });
  }

  get url() {
    return `http://${this.host}:${this.port}/`;
  }

  close() {
    return new Promise((resolve) => this.server.close(resolve));
  }

  async #handleSafely(request, response) {
    try {
      await this.#handle(request, response);
    } catch (err) {
      this.logger.error('unhandled request failure', err);
      if (!response.headersSent) send(response, 500, 'Internal error');
      else response.end();
    }
  }

  async #handle(request, response) {
    const url = new URL(request.url, `http://${this.host}`);
    const pathname = decodeURIComponent(url.pathname);

    // Only ever set in dev; see http/dev-reload.js for why it sits outside /api.
    if (this.devChannel?.handles(pathname)) {
      return this.devChannel.stream(request, response);
    }

    if (!pathname.startsWith('/api/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return send(response, 405, 'Method not allowed');
      }
      return this.#serveStatic(response, pathname);
    }

    if (!this.sessionToken.matches(request.headers['x-shopwise-token'])) {
      return sendJson(response, 401, { error: 'Unauthorized' });
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch (err) {
      return sendJson(response, err.status ?? 400, { error: err.message });
    }

    try {
      const { status, payload } = await this.router.dispatch({
        method: request.method,
        pathname: pathname.slice('/api'.length),
        query: url.searchParams,
        body,
      });
      return sendJson(response, status, payload);
    } catch (err) {
      return this.#sendError(response, request, pathname, err);
    }
  }

  async #serveStatic(response, pathname) {
    const result = await this.staticFiles.resolve(pathname);

    if (result.status !== 200) {
      return send(response, result.status, result.status === 403 ? 'Forbidden' : 'Not found');
    }

    if (result.body !== undefined) {
      return send(response, 200, result.body, { 'content-type': result.type });
    }

    response.writeHead(200, {
      'content-type': result.type,
      'content-length': result.size,
      'cache-control': 'no-cache',
    });
    result.stream.pipe(response);
  }

  #sendError(response, request, pathname, err) {
    const status = err.status ?? 500;

    // A rejected sale is the shopkeeper's business; a crash is ours.
    if (err.expose) this.logger.warn(`${request.method} ${pathname} -> ${status}: ${err.message}`);
    else this.logger.error(`${request.method} ${pathname}`, err);

    return sendJson(response, status, {
      error: err.expose ? err.message : 'Something went wrong. The details are in the log file.',
      code: err.code,
    });
  }
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(body);
}

function sendJson(response, status, payload) {
  send(response, status, JSON.stringify(payload), { 'content-type': JSON_TYPE });
}

async function readJsonBody(request, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('That request was too large.'), { status: 413 });
    chunks.push(chunk);
  }

  if (!chunks.length) return undefined;

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('That request was not valid JSON.'), { status: 400 });
  }
}

module.exports = { HttpServer };
