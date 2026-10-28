'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { WindowLifetime } = require('../../src/platform/lifetime');

/**
 * When the app decides nobody is there any more.
 *
 * This is the policy that got the installed build wrong once already: it used
 * to shut down when the process it launched for the window exited, which Edge
 * does on its own within seconds, leaving a live window pointed at a server
 * that had gone. Everything here is about not making that mistake again —
 * the only thing that counts as "gone" is the page itself going away and
 * staying away.
 */
describe('deciding the window has gone', () => {
  const silent = { info() {}, warn() {}, error() {} };

  /** A hand-cranked clock: timers fire only when the test says so. */
  const fakeTimers = () => {
    const pending = new Map();
    let next = 1;

    return {
      setTimer(fn, delay) {
        const id = next++;
        pending.set(id, { fn, delay });
        return id;
      },
      clearTimer(id) {
        pending.delete(id);
      },
      /** Fires whatever is armed, as if its delay had elapsed. */
      fire() {
        const [id, entry] = [...pending][0] ?? [];
        if (!entry) throw new Error('nothing is armed');
        pending.delete(id);
        entry.fn();
      },
      get armed() {
        return [...pending.values()].map((entry) => entry.delay);
      },
    };
  };

  /** A presence channel without a server under it. */
  const fakePresence = () => {
    const listeners = new Set();
    let count = 0;

    return {
      get count() {
        return count;
      },
      /** Sets the count without telling anyone, for racing against a timer. */
      set count(next) {
        count = next;
      },
      watch(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      set(next) {
        count = next;
        for (const listener of [...listeners]) listener(count);
      },
      get watchers() {
        return listeners.size;
      },
    };
  };

  const setup = (options = {}) => {
    const timers = fakeTimers();
    const presence = fakePresence();
    const gone = [];

    const lifetime = new WindowLifetime({
      presence,
      logger: silent,
      onGone: (reason) => gone.push(reason),
      startupGraceMs: 90000,
      idleGraceMs: 5000,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      ...options,
    });

    return { timers, presence, gone, lifetime };
  };

  test('the window is given time to open before anything is decided', () => {
    const { timers, gone, lifetime } = setup();

    lifetime.start();
    assert.deepEqual(timers.armed, [90000]);
    assert.deepEqual(gone, []);
  });

  test('a window that never opens does not leave the app running invisibly', () => {
    const { timers, gone, lifetime } = setup();

    lifetime.start();
    timers.fire();

    assert.deepEqual(gone, ['the window never opened']);
  });

  test('once the page is there, the startup clock is dropped', () => {
    const { timers, presence, gone, lifetime } = setup();

    lifetime.start();
    presence.set(1);

    assert.deepEqual(timers.armed, [], 'nothing is counting down while someone is looking');
    assert.deepEqual(gone, []);
  });

  test('closing the window shuts the app down, after a moment', () => {
    const { timers, presence, gone, lifetime } = setup();

    lifetime.start();
    presence.set(1);
    presence.set(0);

    assert.deepEqual(timers.armed, [5000], 'not immediately');
    assert.deepEqual(gone, []);

    timers.fire();
    assert.deepEqual(gone, ['the window was closed']);
  });

  test('reloading the page is not closing it', () => {
    const { timers, presence, gone, lifetime } = setup();

    lifetime.start();
    presence.set(1);
    presence.set(0); // the stream drops as the page unloads
    presence.set(1); // and the new page connects a breath later

    assert.deepEqual(timers.armed, []);
    assert.deepEqual(gone, []);
  });

  test('a second window keeps the app alive when the first one closes', () => {
    const { timers, presence, gone, lifetime } = setup();

    lifetime.start();
    presence.set(2);
    presence.set(1);

    assert.deepEqual(timers.armed, []);
    assert.deepEqual(gone, []);
  });

  test('it gives up only once, however the counting goes', () => {
    const { timers, presence, gone, lifetime } = setup();

    lifetime.start();
    presence.set(1);
    presence.set(0);
    timers.fire();

    presence.set(1);
    presence.set(0);

    assert.deepEqual(gone, ['the window was closed']);
    assert.deepEqual(timers.armed, [], 'and stops watching once it has');
  });

  test('a page that is back by the time the clock runs out is not abandoned', () => {
    const { timers, presence, gone, lifetime } = setup();

    lifetime.start();
    presence.set(1);
    presence.set(0);

    // Waking from sleep: the timer and the reconnection race, and the page
    // being there wins.
    presence.count = 1;
    timers.fire();

    assert.deepEqual(gone, []);
  });

  test('stopping it disarms everything', () => {
    const { timers, presence, gone, lifetime } = setup();

    lifetime.start();
    assert.equal(presence.watchers, 1);

    lifetime.stop();

    assert.deepEqual(timers.armed, []);
    assert.equal(presence.watchers, 0);
    assert.deepEqual(gone, []);
  });
});
