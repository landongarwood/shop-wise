'use strict';

/**
 * When should the app stop?
 *
 * The obvious answer — when the window process we launched exits — is wrong,
 * and shipped wrong: Microsoft Edge hands the window to a browser process of
 * its own and lets the one we spawned exit, sometimes within milliseconds.
 * The app took that as "the window was closed", shut the server down, and the
 * window that was still opening landed on "127.0.0.1 refused to connect".
 *
 * So the question is not whether a particular process is alive but whether
 * anyone is still looking at the page — and the page answers that itself, by
 * holding a stream open for as long as it is on screen.
 *
 * Two pieces of slack keep that honest:
 *   - the window needs time to start before it can say anything at all, and
 *   - reloading the page, or a moment of network trouble, drops the stream and
 *     opens a new one a breath later, which must not read as "gone".
 *
 * Timers are injected so the policy can be tested in milliseconds rather than
 * minutes.
 */
class WindowLifetime {
  /**
   * @param {object} deps
   * @param {{watch:Function, count:number}} deps.presence
   * @param {(reason: string) => void} deps.onGone called once, when nobody is left
   * @param {number} [deps.startupGraceMs] how long the window gets to appear
   * @param {number} [deps.idleGraceMs] how long a closed page gets to come back
   */
  constructor({
    presence,
    onGone,
    logger = null,
    startupGraceMs = 90000,
    idleGraceMs = 5000,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  }) {
    this.presence = presence;
    this.onGone = onGone;
    this.logger = logger;
    this.startupGraceMs = startupGraceMs;
    this.idleGraceMs = idleGraceMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;

    this.seen = false;
    this.settled = false;
    this.timer = null;
    this.unwatch = null;
  }

  start() {
    this.unwatch = this.presence.watch((count) => this.#onCount(count));
    this.#arm(this.startupGraceMs, 'the window never opened');
    return this;
  }

  /** Stops watching, e.g. because the app is already shutting down. */
  stop() {
    this.#disarm();
    this.unwatch?.();
    this.unwatch = null;
  }

  #onCount(count) {
    if (this.settled) return;

    if (count > 0) {
      if (!this.seen) this.logger?.info('window is up');
      this.seen = true;
      this.#disarm();
      return;
    }

    // Never seen and already gone: that is the startup grace's business, not
    // a window closing, so leave the longer timer running.
    if (this.seen) this.#arm(this.idleGraceMs, 'the window was closed');
  }

  #arm(delay, reason) {
    this.#disarm();
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (this.settled) return;

      // Ask once more at the last moment. A machine waking from sleep can run
      // this timer and reconnect the page in either order, and the page being
      // back is the more trustworthy of the two.
      if (this.presence.count > 0) {
        this.seen = true;
        return;
      }

      this.settled = true;
      this.stop();
      this.onGone(reason);
    }, delay);
  }

  #disarm() {
    if (this.timer === null) return;
    this.clearTimer(this.timer);
    this.timer = null;
  }
}

module.exports = { WindowLifetime };
