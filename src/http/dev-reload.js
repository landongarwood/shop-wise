'use strict';

const { EventStreamChannel } = require('./event-stream');

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
 * It is only ever created when the app is started with --dev, so the installed
 * app does not answer on this path at all.
 */
class DevReloadChannel extends EventStreamChannel {
  constructor({ path = '/dev/events', logger, keepAliveMs = 15000 } = {}) {
    super({ path, logger, keepAliveMs });
  }

  opened() {
    this.logger?.info('dev reload client connected');
  }

  /** Tells every open page to reload now, without waiting for a restart. */
  broadcast(event = 'reload') {
    super.broadcast(event);
  }
}

module.exports = { DevReloadChannel };
