'use strict';

const { badRequest } = require('../errors');

/**
 * Money is only ever handled as an integer number of minor units (cents).
 *
 * Floats are never summed: a shop's books cannot afford 0.1 + 0.2. Values
 * arriving from the UI are parsed through their decimal string form so no
 * binary rounding happens on the way in.
 */

const MINOR_PER_MAJOR = 100;
const DECIMALS = 2;

/**
 * Accepts 12, "12", "12.5", "12.50" and returns minor units.
 * Rejects anything that is not a plain non-negative amount.
 */
function parseMinor(input, field = 'amount') {
  if (input === null || input === undefined || input === '') {
    throw badRequest(`Enter ${field}.`);
  }

  const text = String(input).trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw badRequest(`${capitalise(field)} must be a number.`);
  }

  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > DECIMALS) {
    throw badRequest(`${capitalise(field)} cannot have more than ${DECIMALS} decimal places.`);
  }

  const minor = Number(whole) * MINOR_PER_MAJOR + Number(fraction.padEnd(DECIMALS, '0'));
  if (!Number.isSafeInteger(minor)) {
    throw badRequest(`${capitalise(field)} is too large.`);
  }
  return minor;
}

/** Validates an amount that is already in minor units. */
function requireMinor(input, field = 'amount') {
  if (!Number.isSafeInteger(input) || input < 0) {
    throw badRequest(`${capitalise(field)} must be a whole number of cents.`);
  }
  return input;
}

const multiply = (minor, quantity) => Math.round(minor * quantity);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const toMajor = (minor) => minor / MINOR_PER_MAJOR;

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

module.exports = { parseMinor, requireMinor, multiply, sum, toMajor, MINOR_PER_MAJOR, DECIMALS };
