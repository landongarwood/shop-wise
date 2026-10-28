'use strict';

const config = require('../config');
const store = require('../store');

/**
 * Route table. Keys are `METHOD /path`; path segments starting with `:` are
 * captured and passed to the handler as `params`.
 *
 * Handlers return a plain value (sent as 200) or `{ status, payload }`.
 */
const routes = new Map();

function register(definitions) {
  for (const [key, handler] of Object.entries(definitions)) {
    routes.set(key, handler);
  }
}

function match(method, route) {
  const wanted = route.replace(/\/+$/, '') || '/';
  const direct = routes.get(`${method} ${wanted}`);
  if (direct) return { handler: direct, params: {} };

  const parts = wanted.split('/');
  for (const [key, handler] of routes) {
    const [keyMethod, keyPath] = key.split(' ');
    if (keyMethod !== method) continue;
    const keyParts = keyPath.split('/');
    if (keyParts.length !== parts.length) continue;

    const params = {};
    const ok = keyParts.every((segment, i) => {
      if (segment.startsWith(':')) {
        params[segment.slice(1)] = parts[i];
        return true;
      }
      return segment === parts[i];
    });
    if (ok) return { handler, params };
  }
  return null;
}

register({
  'GET /meta': () => ({
    product: config.productName,
    version: config.version,
    installed: config.installed,
    dataDir: config.dataDir,
    storage: store.describe(),
  }),

  'GET /health': () => ({ ok: true, at: new Date().toISOString() }),
});

// Feature modules register their own routes here as they are built.
// e.g. require('./entries')(register);

async function dispatch({ method, route, query, body }) {
  const hit = match(method, route);
  if (!hit) {
    throw Object.assign(new Error(`No such endpoint: ${method} ${route}`), { status: 404, expose: true });
  }

  const result = await hit.handler({ params: hit.params, query, body });
  if (result && typeof result === 'object' && 'status' in result && 'payload' in result) return result;
  return { status: 200, payload: result ?? null };
}

module.exports = { dispatch, register };
