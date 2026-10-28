'use strict';

/**
 * Live reload for development, and nothing else.
 *
 * The page holds an EventSource open against this endpoint. When the server
 * restarts — which `node --watch` does on any change under src/ — the stream
 * drops and the browser reconnects on its own; the page treats "connected
 * again after a drop" as its cue to reload. That covers a CSS tweak and a
 * change to a domain service with the same mechanism, and needs no file
 * watching in the browser.
 *
 * This lives outside /api on purpose: EventSource cannot send headers, so it
 * could not present the session token. It is therefore only ever created when
 * the app is started with --dev, it is bound to loopback like the rest of the
 * server, and it carries no data — only the fact that the server is alive.
 */
class DevReloadChannel {
  constructor({ path = '/dev/events', logger, keepAliveMs = 15000 } = {}) {
    this.path = path;
    this.logger = logger;
    this.keepAliveMs = keepAliveMs;
    this.clients = new Set();
  }

  handles(pathname) {
    return pathname === this.path;
  }

  stream(request, response) {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });

    // Reconnect quickly, so a restart costs a moment rather than EventSource's
    // several-second default back-off.
    response.write('retry: 250\n\n');
    response.write('event: hello\ndata: {}\n\n');

    const keepAlive = setInterval(() => {
      // A comment frame: keeps proxies and the browser from closing an idle
      // stream without the page reading it as a reload.
      response.write(': keep-alive\n\n');
    }, this.keepAliveMs);
    keepAlive.unref?.();

    this.clients.add(response);

    const drop = () => {
      clearInterval(keepAlive);
      this.clients.delete(response);
    };
    request.on('close', drop);
    response.on('error', drop);

    this.logger?.info('dev reload client connected');
  }

  /** Tells every open page to reload now, without waiting for a restart. */
  broadcast(event = 'reload') {
    for (const client of this.clients) {
      client.write(`event: ${event}\ndata: {}\n\n`);
    }
  }
}

module.exports = { DevReloadChannel };
