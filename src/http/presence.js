'use strict';

const { EventStreamChannel } = require('./event-stream');

/**
 * Who is looking at the app.
 *
 * The page holds one stream open for as long as it is on screen, so the count
 * of open streams is the answer to "is anybody there?". That is the only
 * reliable answer available: the window is Microsoft Edge, a separate program
 * that hands the window to a browser process of its own and lets the process
 * we launched exit within seconds of starting.
 *
 * Nothing is ever sent down this stream. Opening and closing it is the whole
 * message.
 */
class PresenceChannel extends EventStreamChannel {
  constructor({ path = '/alive', logger, keepAliveMs = 15000 } = {}) {
    super({ path, logger, keepAliveMs });
    this.listeners = new Set();
  }

  /**
   * Calls back with the number of pages listening whenever that changes.
   * @returns {() => void} stops watching
   */
  watch(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  opened() {
    this.#announce();
  }

  closed() {
    this.#announce();
  }

  #announce() {
    for (const listener of [...this.listeners]) listener(this.count);
  }
}

module.exports = { PresenceChannel };
