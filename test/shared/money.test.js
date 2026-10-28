'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const money = require('../../src/shared/money');

describe('money', () => {
  test('parses the forms a price field actually produces', () => {
    assert.equal(money.parseMinor(12), 1200);
    assert.equal(money.parseMinor('12'), 1200);
    assert.equal(money.parseMinor('12.5'), 1250);
    assert.equal(money.parseMinor('12.50'), 1250);
    assert.equal(money.parseMinor('0'), 0);
    assert.equal(money.parseMinor('1,250.75'), 125075);
  });

  test('never loses a cent to binary floating point', () => {
    // 0.1 + 0.2 in cents is exact; as floats it is not.
    assert.equal(money.sum([money.parseMinor('0.1'), money.parseMinor('0.2')]), 30);
    assert.equal(money.parseMinor('19.99') * 3, 5997);
  });

  test('rejects amounts a shop could not key in', () => {
    for (const bad of ['', null, undefined, 'abc', '-5', '1.234', '1e3', '12.', '.5']) {
      assert.throws(() => money.parseMinor(bad), /price|amount|number|decimal/i, `accepted ${bad}`);
    }
  });

  test('multiplies by a fractional quantity to a whole cent', () => {
    assert.equal(money.multiply(1200, 1.5), 1800);
    assert.equal(money.multiply(15, 3), 45);
    assert.equal(money.multiply(333, 3), 999);
    // 0.15 x 7 = 1.05 exactly, not 1.0499999999999998
    assert.equal(money.multiply(15, 7), 105);
  });

  test('requireMinor guards values that are already in cents', () => {
    assert.equal(money.requireMinor(1250), 1250);
    assert.throws(() => money.requireMinor(12.5), /whole number/i);
    assert.throws(() => money.requireMinor(-1), /whole number/i);
  });
});
