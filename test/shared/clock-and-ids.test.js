'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { SystemClock, FixedClock, toLocalDay, resolveInstant } = require('../../src/shared/clock');
const { UuidIds, SequentialIds } = require('../../src/shared/ids');
const { AppError, badRequest, notFound, conflict } = require('../../src/errors');

/**
 * The small injected pieces. They exist so that services can be tested at a
 * fixed instant with predictable ids, so the thing worth checking is that the
 * test doubles really behave like the real ones.
 */
describe('the clock', () => {
  test('a local day is the shop\'s day, zero padded', () => {
    assert.equal(toLocalDay(new Date(2026, 2, 5, 23, 30)), '2026-03-05');
    assert.equal(toLocalDay(new Date(2026, 11, 31, 0, 1)), '2026-12-31');
  });

  test('late evening stays on its own day, whatever UTC says', () => {
    // The bug this guards: formatting through toISOString would roll a 23:30
    // sale into tomorrow for anyone east of Greenwich, and yesterday west of it.
    const lateEvening = new Date(2026, 5, 10, 23, 45);
    assert.equal(toLocalDay(lateEvening), '2026-06-10');

    const earlyMorning = new Date(2026, 5, 10, 0, 15);
    assert.equal(toLocalDay(earlyMorning), '2026-06-10');
  });

  test('the system clock agrees with itself', () => {
    const clock = new SystemClock();

    assert.ok(clock.now() instanceof Date);
    assert.equal(clock.today(), toLocalDay(new Date()));
    assert.match(clock.today(), /^\d{4}-\d{2}-\d{2}$/);
  });

  test('a fixed clock does not move, and hands out copies', () => {
    const clock = new FixedClock('2026-03-15T10:00:00');

    assert.equal(clock.today(), '2026-03-15');
    assert.equal(clock.now().getTime(), clock.now().getTime());

    // A caller mutating the Date must not shift everyone else's idea of now.
    const borrowed = clock.now();
    borrowed.setFullYear(1999);
    assert.equal(clock.now().getFullYear(), 2026);
  });
});

/**
 * A date field answers with a day and no time, so something has to decide what
 * time that day means. Getting this wrong is what made every payment taken
 * through the app read "12:00 PM".
 */
describe('working out when something happened', () => {
  const clock = new FixedClock('2026-03-15T14:30:00.000Z');
  const today = clock.today();
  const yesterdayNoon = () => {
    const date = new Date(clock.now());
    date.setDate(date.getDate() - 1);
    return toLocalDay(date);
  };

  test('nothing given means now', () => {
    assert.equal(resolveInstant(undefined, clock), clock.now().toISOString());
    assert.equal(resolveInstant('', clock), clock.now().toISOString());
    assert.equal(resolveInstant(null, clock), clock.now().toISOString());
  });

  test("today, with no time, means now — not the middle of the day", () => {
    const at = resolveInstant(today, clock);

    assert.equal(at, clock.now().toISOString());
    assert.equal(toLocalDay(new Date(at)), today);
  });

  test('another day has no time to know, so it sits at noon', () => {
    const at = resolveInstant(yesterdayNoon(), clock);
    const local = new Date(at);

    assert.equal(toLocalDay(local), yesterdayNoon(), 'and stays on the day that was asked for');
    assert.equal(local.getHours(), 12);
    assert.equal(local.getMinutes(), 0);
  });

  test('a full instant is taken at its word, today or not', () => {
    const exact = '2026-03-15T09:15:00.000Z';

    assert.equal(resolveInstant(exact, clock), exact);
  });

  test('a day that does not exist is still refused', () => {
    assert.throws(() => resolveInstant('2026-02-31', clock), /not a real date/);
  });
});

describe('identifiers', () => {
  test('uuids are unique and look like uuids', () => {
    const ids = new UuidIds();
    const minted = new Set(Array.from({ length: 500 }, () => ids.next()));

    assert.equal(minted.size, 500);
    assert.match([...minted][0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('the sequential double counts up, and two of them stay apart', () => {
    const ids = new SequentialIds('x');

    assert.deepEqual([ids.next(), ids.next(), ids.next()], ['x1', 'x2', 'x3']);
    assert.equal(new SequentialIds('y').next(), 'y1');
  });
});

describe('errors', () => {
  test('carry how the HTTP layer should present them', () => {
    assert.deepEqual(
      [badRequest('no'), notFound('gone'), conflict('clash')].map((e) => [e.status, e.expose]),
      [
        [400, true],
        [404, true],
        [409, true],
      ]
    );
  });

  test('a bare AppError is treated as ours to fix, not theirs to read', () => {
    const error = new AppError('something internal');

    assert.equal(error.status, 500);
    assert.equal(error.expose, false, 'so the HTTP layer hides the detail');
    assert.ok(error instanceof Error, 'and it still behaves like an error');
    assert.equal(error.name, 'AppError');
  });

  test('a code can be attached for the UI to branch on', () => {
    assert.equal(badRequest('no', 'PRICE_TOO_LOW').code, 'PRICE_TOO_LOW');
    assert.equal(badRequest('no').code, undefined);
  });
});
