'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const quantity = require('../../src/shared/quantity');

/**
 * Quantities are numbers rather than integers, because goods sold by weight
 * are real. That makes float dust the thing to watch: stock is a running sum
 * of them, and 20.000000000000004 kg in a table is the kind of detail that
 * makes a shopkeeper stop trusting the figures.
 */
describe('quantities', () => {
  test('accepts whole numbers and weights, however they arrive', () => {
    assert.equal(quantity.parse(3), 3);
    assert.equal(quantity.parse('3'), 3);
    assert.equal(quantity.parse(' 1.5 '), 1.5);
    assert.equal(quantity.parse('0.001'), 0.001);
  });

  test('refuses nothing, nonsense, and zero', () => {
    for (const bad of ['', null, undefined, 'abc', {}]) {
      assert.throws(() => quantity.parse(bad), /quantity/i, `accepted ${JSON.stringify(bad)}`);
    }

    // Zero and below are not a quantity: a sale of none is a mistake, not a sale.
    assert.throws(() => quantity.parse(0), /more than zero/);
    assert.throws(() => quantity.parse(-2), /more than zero/);
  });

  test('refuses more precision than a shop can count', () => {
    assert.throws(() => quantity.parse('1.2345'), /more than 3 decimal places/);
    assert.equal(quantity.parse('1.234'), 1.234, 'three is allowed');
  });

  test('names the field it was given, so the message fits the screen', () => {
    assert.throws(() => quantity.parse('', 'amount'), /Enter a amount\./);
    assert.throws(() => quantity.parse(0, 'amount'), /Amount must be more than zero\./);
  });

  test('normalise clears the dust that repeated addition leaves', () => {
    let running = 0;
    for (let i = 0; i < 10; i += 1) running += 0.1;

    assert.notEqual(running, 1, 'this is the problem being solved');
    assert.equal(quantity.normalise(running), 1);
    assert.equal(quantity.normalise(0.1 + 0.2), 0.3);
    assert.equal(quantity.normalise(20 - 0.1 * 3), 19.7);
  });

  test('normalise leaves a clean number alone', () => {
    assert.equal(quantity.normalise(5), 5);
    assert.equal(quantity.normalise(1.5), 1.5);
    assert.equal(quantity.normalise(-3), -3, 'stock can go negative when a sale outruns the books');
  });
});
