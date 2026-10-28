'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const validate = require('../../src/shared/validate');
const { AppError } = require('../../src/errors');

/**
 * The checks every write passes through. Two things matter beyond the obvious:
 * the messages are shown to a shopkeeper, so they have to be in plain language,
 * and a bare day has to land on the day it was typed whatever the timezone.
 */
describe('input checks', () => {
  describe('text', () => {
    test('trims, and keeps what is left', () => {
      assert.equal(validate.text('  Coffee beans  ', 'name'), 'Coffee beans');
    });

    test('refuses an empty required value in words the user can act on', () => {
      for (const empty of ['', '   ', null, undefined, 42, {}]) {
        assert.throws(() => validate.text(empty, 'product name'), (error) => {
          assert.equal(error.message, 'Enter a product name.');
          assert.equal(error.status, 400);
          assert.equal(error.expose, true);
          return true;
        });
      }
    });

    test('an optional value may be absent, and comes back empty', () => {
      assert.equal(validate.text('', 'note', { required: false }), '');
      assert.equal(validate.text(null, 'note', { required: false }), '');
      assert.equal(validate.text('  ', 'note', { required: false }), '');
    });

    test('enforces a length, counting after the trim', () => {
      assert.equal(validate.text(`  ${'a'.repeat(10)}  `, 'note', { max: 10 }).length, 10);
      assert.throws(() => validate.text('a'.repeat(11), 'note', { max: 10 }), /too long \(max 10 characters\)/);
    });
  });

  describe('id', () => {
    test('accepts a trimmed identifier', () => {
      assert.equal(validate.id(' abc ', 'customer'), 'abc');
    });

    test('asks for a choice rather than reporting a missing id', () => {
      for (const empty of ['', '  ', null, undefined, 7]) {
        assert.throws(() => validate.id(empty, 'customer'), /Choose a customer\./);
      }
    });
  });

  describe('instant', () => {
    test('a bare day lands on that day, not the day before', () => {
      // Anchored at local noon, so no timezone or daylight-saving shift can
      // move a sale into yesterday.
      const iso = validate.instant('2026-03-15');
      const local = new Date(iso);

      assert.equal(local.getFullYear(), 2026);
      assert.equal(local.getMonth(), 2);
      assert.equal(local.getDate(), 15);
      assert.equal(local.getHours(), 12);
    });

    test('a full instant is kept as given', () => {
      assert.equal(validate.instant('2026-03-15T08:30:00.000Z'), '2026-03-15T08:30:00.000Z');
    });

    test('nothing at all means nothing, so the caller can default it', () => {
      assert.equal(validate.instant(null), null);
      assert.equal(validate.instant(undefined), null);
      assert.equal(validate.instant(''), null);
    });

    test('refuses something that is not a date', () => {
      assert.throws(() => validate.instant('last tuesday', 'date'), /Date is not a valid date\./);
      assert.throws(() => validate.instant('2026-13-45'), /not a real date/);
      assert.throws(() => validate.instant('2026-02-31'), /not a real date/, 'February never has 31 days');
      assert.equal(new Date(validate.instant('2024-02-29')).getDate(), 29, 'a leap day is real');
    });
  });

  describe('array', () => {
    test('passes a list through', () => {
      assert.deepEqual(validate.array([1, 2], 'product'), [1, 2]);
    });

    test('refuses an empty or absent list', () => {
      for (const bad of [[], null, undefined, 'nope', {}]) {
        assert.throws(() => validate.array(bad, 'product'), /Add at least 1 product\./);
      }
    });

    test('a higher minimum is reported as such', () => {
      assert.throws(() => validate.array([1], 'line', { min: 2 }), /at least 2 line/);
    });
  });

  describe('integer', () => {
    test('accepts whole numbers, including as text', () => {
      assert.equal(validate.integer(5, 'limit'), 5);
      assert.equal(validate.integer('5', 'limit'), 5);
      assert.equal(validate.integer(0, 'limit'), 0);
    });

    test('refuses fractions and nonsense', () => {
      for (const bad of [1.5, 'abc', '', null, undefined, NaN, {}]) {
        assert.throws(() => validate.integer(bad, 'limit'), /Limit must be a whole number\./);
      }
    });

    test('enforces the range it was given', () => {
      assert.throws(() => validate.integer(0, 'limit', { min: 1 }), /between 1 and/);
      assert.throws(() => validate.integer(500, 'limit', { max: 100 }), /between 0 and 100/);
      assert.equal(validate.integer(100, 'limit', { max: 100 }), 100, 'the bound itself is allowed');
    });
  });

  test('every refusal is an AppError the HTTP layer can present', () => {
    for (const failing of [
      () => validate.text('', 'name'),
      () => validate.id('', 'customer'),
      () => validate.instant('nope'),
      () => validate.array([], 'line'),
      () => validate.integer('x', 'limit'),
    ]) {
      assert.throws(failing, (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.status, 400);
        assert.equal(error.expose, true, 'the message is meant to be read');
        assert.match(error.message, /\.$/, 'written as a sentence');
        return true;
      });
    }
  });
});
