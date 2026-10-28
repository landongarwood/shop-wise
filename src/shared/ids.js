'use strict';

const crypto = require('node:crypto');

/** Identity generation as a dependency, so records are predictable in tests. */
class UuidIds {
  next() {
    return crypto.randomUUID();
  }
}

/** Sequential ids for tests: s1, s2, … */
class SequentialIds {
  constructor(prefix = 'id') {
    this.prefix = prefix;
    this.count = 0;
  }

  next() {
    this.count += 1;
    return `${this.prefix}${this.count}`;
  }
}

module.exports = { UuidIds, SequentialIds };
