'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { SessionToken } = require('../../src/http/session-token');

/**
 * Not a login: there are no accounts and nothing to sign into. This exists
 * because the app serves itself on a loopback port while it is running, and
 * without it any page the user happens to have open in a browser could post
 * into the shop's books.
 */
describe('the session token', () => {
  test('is long and random, and two of them differ', () => {
    const token = new SessionToken();

    assert.match(token.value, /^[0-9a-f]{48}$/, '24 random bytes as hex');
    assert.notEqual(new SessionToken().value, new SessionToken().value);
  });

  test('accepts itself', () => {
    const token = new SessionToken();
    assert.equal(token.matches(token.value), true);
  });

  test('rejects anything else', () => {
    const token = new SessionToken('a'.repeat(48));

    assert.equal(token.matches('b'.repeat(48)), false, 'same length, wrong value');
    assert.equal(token.matches('a'.repeat(47)), false, 'truncated');
    assert.equal(token.matches(`${'a'.repeat(48)}b`), false, 'with something appended');
    assert.equal(token.matches(''), false);
  });

  test('rejects a missing or non-string candidate without throwing', () => {
    const token = new SessionToken();

    // What an absent header looks like by the time it reaches here.
    for (const candidate of [undefined, null, 0, {}, [], ['a'], true]) {
      assert.equal(token.matches(candidate), false, `accepted ${JSON.stringify(candidate)}`);
    }
  });

  test('comparison is length-checked first, so timingSafeEqual is never misused', () => {
    // crypto.timingSafeEqual throws on a length mismatch; a guard that forgot
    // that would turn a wrong token into a 500 instead of a 401.
    const token = new SessionToken('abc123');

    assert.doesNotThrow(() => token.matches('short'));
    assert.doesNotThrow(() => token.matches('a-much-longer-candidate'));
  });

  test('can be given a known value, which is what tests need', () => {
    assert.equal(new SessionToken('fixed').value, 'fixed');
    assert.equal(new SessionToken('fixed').matches('fixed'), true);
  });
});
