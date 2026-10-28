'use strict';

const crypto = require('node:crypto');

/**
 * A secret minted once per run and shared only with the page this server
 * serves. Every /api call must present it.
 *
 * Without this, a loopback server is an open API to any website the user has
 * open in a browser: the port is guessable and the requests are same-protocol.
 */
class SessionToken {
  constructor(value = crypto.randomBytes(24).toString('hex')) {
    this.value = value;
    this.buffer = Buffer.from(value, 'utf8');
  }

  /** Length-checked and constant-time, so the comparison leaks nothing. */
  matches(candidate) {
    if (typeof candidate !== 'string') return false;

    const other = Buffer.from(candidate, 'utf8');
    if (other.length !== this.buffer.length) return false;

    return crypto.timingSafeEqual(this.buffer, other);
  }
}

module.exports = { SessionToken };
