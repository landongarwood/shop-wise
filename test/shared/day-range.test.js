'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const dayRange = require('../../src/shared/day-range');
const { FixedClock } = require('../../src/shared/clock');

/**
 * Report periods. Every boundary here is local, because "today's takings" has
 * to mean the day the shopkeeper is standing in — a UTC window would cut the
 * evening off in one direction and borrow the night in the other.
 */
describe('day ranges', () => {
  // A Sunday, deliberately: the week boundary is the easiest one to get wrong.
  const sunday = new FixedClock('2026-03-15T14:30:00');
  const resolve = (query, clock = sunday) => dayRange.resolve(query, clock);

  const spans = (range) => [range.fromDay, range.toDay];

  test('today covers the whole local day', () => {
    const range = resolve({ preset: 'today' });

    assert.deepEqual(spans(range), ['2026-03-15', '2026-03-15']);
    assert.equal(range.label, 'Today');
    assert.equal(new Date(range.fromIso).getHours(), 0);
    assert.equal(new Date(range.toIso).getHours(), 23);
    assert.equal(new Date(range.toIso).getMinutes(), 59);
  });

  test('yesterday is the day before, in full', () => {
    assert.deepEqual(spans(resolve({ preset: 'yesterday' })), ['2026-03-14', '2026-03-14']);
  });

  test('the week runs Monday to today, not Sunday to Saturday', () => {
    // 15 March 2026 is a Sunday, so its trading week began on the 9th.
    assert.equal(new Date('2026-03-15T12:00:00').getDay(), 0, 'the fixture really is a Sunday');
    assert.deepEqual(spans(resolve({ preset: 'week' })), ['2026-03-09', '2026-03-15']);
  });

  test('a Monday is the first day of its own week', () => {
    const monday = new FixedClock('2026-03-16T09:00:00');
    assert.deepEqual(spans(resolve({ preset: 'week' }, monday)), ['2026-03-16', '2026-03-16']);
  });

  test('the month runs from the first to today', () => {
    assert.deepEqual(spans(resolve({ preset: 'month' })), ['2026-03-01', '2026-03-15']);
  });

  test('last month is that whole month, however long it was', () => {
    assert.deepEqual(spans(resolve({ preset: 'lastMonth' })), ['2026-02-01', '2026-02-28']);

    const january = new FixedClock('2026-01-10T09:00:00');
    assert.deepEqual(spans(resolve({ preset: 'lastMonth' }, january)), ['2025-12-01', '2025-12-31'], 'and crosses a year');

    const leapYear = new FixedClock('2024-03-05T09:00:00');
    assert.deepEqual(spans(resolve({ preset: 'lastMonth' }, leapYear)), ['2024-02-01', '2024-02-29']);
  });

  test('the year runs from January to today', () => {
    assert.deepEqual(spans(resolve({ preset: 'year' })), ['2026-01-01', '2026-03-15']);
  });

  test('all time is unbounded rather than very wide', () => {
    const range = resolve({ preset: 'all' });

    assert.deepEqual([range.fromIso, range.toIso], [null, null]);
    assert.equal(range.label, 'All time');
  });

  test('month is what you get when nothing is asked for', () => {
    assert.deepEqual(spans(resolve({})), spans(resolve({ preset: 'month' })));
  });

  test('explicit dates win over a preset, and include both ends', () => {
    const range = resolve({ preset: 'today', from: '2026-01-05', to: '2026-01-07' });

    assert.deepEqual(spans(range), ['2026-01-05', '2026-01-07']);
    assert.equal(range.label, 'Custom range');
    assert.equal(dayRange.contains(range, new Date('2026-01-07T23:00:00').toISOString()), true);
    assert.equal(dayRange.contains(range, new Date('2026-01-08T00:30:00').toISOString()), false);
  });

  test('one date alone is that single day', () => {
    assert.deepEqual(spans(resolve({ from: '2026-01-05' })), ['2026-01-05', '2026-01-05']);
    assert.deepEqual(spans(resolve({ to: '2026-01-05' })), ['2026-01-05', '2026-01-05']);
  });

  test('refuses a period it cannot make sense of', () => {
    assert.throws(() => resolve({ preset: 'fortnight' }), /Unknown period "fortnight"/);
    assert.throws(() => resolve({ from: '2026-03-10', to: '2026-03-01' }), /ends before it starts/);
    assert.throws(() => resolve({ from: 'yesterday' }), /date like 2026-03-15/);
    assert.throws(() => resolve({ from: '2026-02-31' }), /not a real date/);
    assert.throws(() => resolve({ from: '2026-13-01' }), /not a real date/);
  });

  describe('contains', () => {
    const range = resolve({ preset: 'today' });

    test('takes the first and last moment of the day', () => {
      assert.equal(dayRange.contains(range, range.fromIso), true);
      assert.equal(dayRange.contains(range, range.toIso), true);
    });

    test('rejects either side of it', () => {
      assert.equal(dayRange.contains(range, new Date('2026-03-14T23:59:59').toISOString()), false);
      assert.equal(dayRange.contains(range, new Date('2026-03-16T00:00:01').toISOString()), false);
    });

    test('an unbounded range contains everything', () => {
      const all = resolve({ preset: 'all' });

      assert.equal(dayRange.contains(all, '1999-01-01T00:00:00.000Z'), true);
      assert.equal(dayRange.contains(all, '2099-01-01T00:00:00.000Z'), true);
    });
  });
});
