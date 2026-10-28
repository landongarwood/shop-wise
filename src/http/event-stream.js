'use strict';

/**
 * One server-sent-event endpoint: a path, the pages currently listening on it,
 * and the plumbing that keeps those streams open.
 *
 * Both of the app's channels are this shape — live reload in development, and
 * the presence stream that says a window is still on screen — so the protocol
 * lives here once and each channel only has to say what it means.
 *
 * They sit outside /api on purpose: EventSource cannot set headers, so it could
 * not present the session token. They are bound to loopback like the rest of
 * the server and carry no shop data — only the fact that the server is alive
 * and that somebody is listening.
 */
class EventStreamChannel {
  constructor({ path, logger = null, keepAliveMs = 15000 } = {}) {
    this.path = path;
    this.logger = logger;
    this.keepAliveMs = keepAliveMs;
    this.clients = new Set();
    this.timers = new Map();
  }

  handles(pathname) {
    return pathname === this.path;
  }

  get count() {
    return this.clients.size;
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
      // stream without the page reading it as an event.
      response.write(': keep-alive\n\n');
    }, this.keepAliveMs);
    keepAlive.unref?.();

    this.clients.add(response);
    this.timers.set(response, keepAlive);

    const drop = () => this.#drop(response);
    request.on('close', drop);
    response.on('error', drop);

    this.opened(response);
  }

  /** Sends to every page still listening. */
  broadcast(event, data = {}) {
    for (const client of this.clients) {
      client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }

  /**
   * Lets go of every stream. The server calls this as it shuts down: an open
   * event stream would otherwise hold the socket, and with it the process.
   */
  closeAll() {
    for (const client of [...this.clients]) {
      this.#drop(client);
      client.end();
    }
  }

  /* Hooks for subclasses; the base channel does not care who comes and goes. */
  opened() {}
  closed() {}

  #drop(response) {
    if (!this.clients.delete(response)) return;
    clearInterval(this.timers.get(response));
    this.timers.delete(response);
    this.closed(response);
  }
}

module.exports = { EventStreamChannel };
