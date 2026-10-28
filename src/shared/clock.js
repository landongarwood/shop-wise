'use strict';

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

module.exports = { SystemClock, FixedClock, toLocalDay };
