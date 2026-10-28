'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, describe, before } = require('node:test');

const config = require('../../src/config');

/**
 * The only place that turns stored values into what the screen says.
 *
 * It is a browser module, but it touches nothing but Intl, so it can be run
 * here — which is worth doing, because every figure the shopkeeper reads comes
 * through it and a mistake here is invisible until someone disputes a total.
 */
describe('formatting', () => {
  let createFormat;

  before(async () => {
    const module = await import(pathToFileURL(path.join(config.uiDir, 'core', 'format.js')).href);
    createFormat = module.createFormat;
  });

  const yuan = () => createFormat({ currency: '¥' });

  describe('money', () => {
    test('shows the shop\'s symbol and always two decimals', () => {
      const format = yuan();

      assert.equal(format.money(0), '¥0.00');
      assert.equal(format.money(5), '¥0.05');
      assert.equal(format.money(50), '¥0.50');
      assert.equal(format.money(1200), '¥12.00');
      assert.equal(format.money(1250), '¥12.50');
    });

    test('puts the minus before the symbol, not after it', () => {
      assert.equal(yuan().money(-1250), '-¥12.50');
    });

    test('groups thousands, so a large figure can be read at a glance', () => {
      assert.match(yuan().money(123456789), /^¥1\D?234\D?567\.89$/);
    });

    test('follows whatever symbol the shop chose', () => {
      assert.equal(createFormat({ currency: '$' }).money(1250), '$12.50');
      assert.equal(createFormat({ currency: 'KSh' }).money(1250), 'KSh12.50');
    });

    test('falls back to yuan when there are no settings yet', () => {
      assert.equal(createFormat(null).money(100), '¥1.00');
      assert.equal(createFormat({}).money(100), '¥1.00');
      assert.equal(createFormat({ currency: '' }).money(100), '¥1.00');
    });

    test('treats a missing amount as nothing rather than NaN', () => {
      assert.equal(yuan().money(undefined), '¥0.00');
      assert.equal(yuan().money(null), '¥0.00');
    });

    test('moneyInput is the bare decimal a field starts with', () => {
      const format = yuan();

      assert.equal(format.moneyInput(1250), '12.50');
      assert.equal(format.moneyInput(5), '0.05');
      assert.equal(format.moneyInput(0), '0.00');
      assert.ok(!format.moneyInput(1250).includes('¥'), 'no symbol, or it would be typed back in');
    });
  });

  describe('quantities', () => {
    test('drops trailing zeroes but keeps real decimals', () => {
      const format = yuan();

      assert.equal(format.quantity(3), '3');
      assert.equal(format.quantity(3.0), '3');
      assert.equal(format.quantity(1.5), '1.5');
      assert.equal(format.quantity(0.25), '0.25');
    });

    test('appends the unit only when there is one', () => {
      const format = yuan();

      assert.equal(format.quantityWithUnit(2, 'kg'), '2 kg');
      assert.equal(format.quantityWithUnit(2, ''), '2');
      assert.equal(format.quantityWithUnit(2, null), '2');
    });
  });

  describe('balances', () => {
    test('say which way the money is owed, in words', () => {
      const format = yuan();

      assert.deepEqual(format.balance(3320), { text: 'owes ¥33.20', amount: '¥33.20', tone: 'debt' });
      assert.deepEqual(format.balance(-1360), { text: '¥13.60 in credit', amount: '¥13.60', tone: 'paid' });
      assert.deepEqual(format.balance(0), { text: 'settled up', amount: '¥0.00', tone: 'quiet' });
    });

    test('a credit is shown as a positive figure, the direction being in the words', () => {
      assert.equal(yuan().balance(-500).amount, '¥5.00', 'not -¥5.00');
    });
  });

  describe('dates', () => {
    const iso = (date) => date.toISOString();

    test('today and yesterday are named rather than dated', () => {
      const format = yuan();
      const now = new Date();

      assert.equal(format.relativeDay(iso(now)), 'Today');

      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      assert.equal(format.relativeDay(iso(yesterday)), 'Yesterday');
    });

    test('anything older gets a date', () => {
      const older = new Date();
      older.setDate(older.getDate() - 9);

      const shown = yuan().relativeDay(iso(older));
      assert.notEqual(shown, 'Today');
      assert.notEqual(shown, 'Yesterday');
      assert.match(shown, /\d/);
    });

    test('a sale late in the evening is still today', () => {
      // The bug this guards: comparing ISO strings would roll it into tomorrow.
      const now = new Date();
      const lateToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 50);

      assert.equal(yuan().relativeDay(iso(lateToday)), 'Today');
    });

    test('dateInput gives the local day a date field expects', () => {
      const format = yuan();
      const lateToday = new Date();
      lateToday.setHours(23, 50, 0, 0);

      assert.match(format.dateInput(iso(lateToday)), /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(format.dateInput(iso(lateToday)), format.dateInput(), 'the same local day as now');
    });

    test('dayAndTime pairs the named day with a time', () => {
      assert.match(yuan().dayAndTime(iso(new Date())), /^Today, /);
    });
  });
});
