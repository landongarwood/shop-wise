'use strict';

const { notFound } = require('../errors');

/**
 * A small method-and-path router.
 *
 * Route modules register themselves against it, so adding an endpoint never
 * means editing a central switch: the only thing that changes is the module
 * that owns the new behaviour.
 *
 * Handlers receive `{ params, query, body }` and return either a plain value,
 * which is sent as 200, or `{ status, payload }` when they need to say more.
 */
class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    this.routes.push({
      method,
      segments: split(pattern),
      handler,
    });
    return this;
  }

  get(pattern, handler) {
    return this.add('GET', pattern, handler);
  }

  post(pattern, handler) {
    return this.add('POST', pattern, handler);
  }

  patch(pattern, handler) {
    return this.add('PATCH', pattern, handler);
  }

  delete(pattern, handler) {
    return this.add('DELETE', pattern, handler);
  }

  match(method, pathname) {
    const parts = split(pathname);

    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;

      const params = {};
      const matched = route.segments.every((segment, index) => {
        if (segment.startsWith(':')) {
          params[segment.slice(1)] = decodeURIComponent(parts[index]);
          return true;
        }
        return segment === parts[index];
      });

      if (matched) return { handler: route.handler, params };
    }
    return null;
  }

  async dispatch({ method, pathname, query, body }) {
    const found = this.match(method, pathname);
    if (!found) throw notFound(`No such endpoint: ${method} ${pathname}`);

    const result = await found.handler({ params: found.params, query, body });

    if (result && typeof result === 'object' && 'status' in result && 'payload' in result) {
      return result;
    }
    return { status: 200, payload: result ?? null };
  }
}

const split = (pathname) => pathname.split('/').filter(Boolean);

module.exports = { Router };
