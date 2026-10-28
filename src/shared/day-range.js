'use strict';

const { badRequest } = require('../errors');
const { toLocalDay } = require('./clock');

/**
 * Turning "this month" or "1st to 14th" into a pair of instants.
 *
 * Ranges are inclusive of both days and anchored to local midnight, so a report
 * for today covers the shopkeeper's day rather than a UTC window that cuts the
 * evening off.
 */

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value, field) {
  if (!DAY_PATTERN.test(String(value ?? ''))) {
    throw badRequest(`${field} must be a date like 2026-03-15.`);
  }
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1) {
    throw badRequest(`${field} is not a real date.`);
  }
  return date;
}

const startOf = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
const endOf = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

/**
 * @param {object} input
 * @param {string} [input.preset] today | yesterday | week | month | lastMonth | year | all
 * @param {string} [input.from] YYYY-MM-DD
 * @param {string} [input.to] YYYY-MM-DD
 * @param {{now:Function}} clock
 * @returns {{fromDay:string|null, toDay:string|null, fromIso:string|null, toIso:string|null, label:string}}
 */
/**
 * The instants a pair of days covers: midnight to the last millisecond of the
 * last day, with either day standing in for a missing other.
 *
 * Filtering by a day has to mean the whole day. Reading it as a single instant
 * is how "from today" ends up missing the morning.
 *
 * @returns {{fromIso: string|null, toIso: string|null}} nulls when no day was given
 */
function boundsFor(from, to) {
  if (!from && !to) return { fromIso: null, toIso: null };

  const start = startOf(parseDay(from ?? to, 'From'));
  const end = endOf(parseDay(to ?? from, 'To'));

  if (end < start) throw badRequest('That range ends before it starts.');
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

function resolve({ preset = null, from = null, to = null } = {}, clock) {
  const now = clock.now();

  if (from || to) {
    const start = startOf(parseDay(from ?? to, 'From'));
    const end = endOf(parseDay(to ?? from, 'To'));

    if (end < start) throw badRequest('That range ends before it starts.');
    return bounds(start, end, 'Custom range');
  }

  switch (preset ?? 'month') {
    case 'all':
      return { fromDay: null, toDay: null, fromIso: null, toIso: null, label: 'All time' };

    case 'today':
      return bounds(startOf(now), endOf(now), 'Today');

    case 'yesterday': {
      const yesterday = addDays(now, -1);
      return bounds(startOf(yesterday), endOf(yesterday), 'Yesterday');
    }

    case 'week': {
      // Monday to today, which is how a trading week is usually read.
      const offset = (now.getDay() + 6) % 7;
      return bounds(startOf(addDays(now, -offset)), endOf(now), 'This week');
    }

    case 'month':
      return bounds(new Date(now.getFullYear(), now.getMonth(), 1), endOf(now), 'This month');

    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = endOf(new Date(now.getFullYear(), now.getMonth(), 0));
      return bounds(start, end, 'Last month');
    }

    case 'year':
      return bounds(new Date(now.getFullYear(), 0, 1), endOf(now), 'This year');

    default:
      throw badRequest(`Unknown period "${preset}".`);
  }
}

function bounds(start, end, label) {
  return {
    fromDay: toLocalDay(start),
    toDay: toLocalDay(end),
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
    label,
  };
}

const addDays = (date, days) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes());

/** True when an ISO instant falls inside the resolved range. */
const contains = (range, iso) =>
  (!range.fromIso || iso >= range.fromIso) && (!range.toIso || iso <= range.toIso);

module.exports = { resolve, contains, boundsFor };
