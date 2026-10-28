'use strict';

const validate = require('./validate');

/**
 * Time as a dependency rather than a global, so services can be tested at a
 * fixed instant and so "today" has exactly one definition.
 */

/** Local calendar day as YYYY-MM-DD. The shop's day, not UTC's. */
function toLocalDay(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

class SystemClock {
  now() {
    return new Date();
  }

  today() {
    return toLocalDay(this.now());
  }
}

/** Fixed clock for tests. */
class FixedClock {
  constructor(instant) {
    this.instant = new Date(instant);
  }

  now() {
    return new Date(this.instant);
  }

  today() {
    return toLocalDay(this.instant);
  }
}

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * When something happened, given what the screen was able to say.
 *
 * A date field answers with a day and no time at all. If that day is today,
 * the time is now — the shop is recording something as it happens, and every
 * line of the day reading "12:00" is both untrue and useless for seeing what
 * order things went in.
 *
 * Any other day has no time to know, so it sits at noon: far enough from both
 * midnights that no timezone or daylight-saving shift can roll it onto the
 * wrong day. Nothing is given means now.
 */
function resolveInstant(value, clock, field = 'date') {
  const given = validate.instant(value, field);
  if (given === null) return clock.now().toISOString();

  const isDayOnly = typeof value === 'string' && DAY_ONLY.test(value);
  if (isDayOnly && toLocalDay(new Date(given)) === clock.today()) {
    return clock.now().toISOString();
  }
  return given;
}

module.exports = { SystemClock, FixedClock, toLocalDay, resolveInstant };
