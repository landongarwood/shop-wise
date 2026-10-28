'use strict';

const { badRequest } = require('../errors');

/**
 * Quantities allow up to three decimals so goods sold by weight (1.5 kg) work
 * alongside goods sold by the piece. They are kept as numbers because, unlike
 * money, quantities are not summed across thousands of rows into a figure
 * anyone reconciles to the cent.
 */

const MAX_DECIMALS = 3;

function parse(input, field = 'quantity') {
  if (input === null || input === undefined || input === '') {
    throw badRequest(`Enter a ${field}.`);
  }

  const value = Number(String(input).trim());
  if (!Number.isFinite(value)) throw badRequest(`${capitalise(field)} must be a number.`);
  if (value <= 0) throw badRequest(`${capitalise(field)} must be more than zero.`);

  const rounded = Number(value.toFixed(MAX_DECIMALS));
  if (rounded !== value) {
    throw badRequest(`${capitalise(field)} cannot have more than ${MAX_DECIMALS} decimal places.`);
  }
  return rounded;
}

/** Keeps derived stock totals free of float dust like 2.9999999999999996. */
const normalise = (value) => Number(value.toFixed(MAX_DECIMALS));

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

module.exports = { parse, normalise, MAX_DECIMALS };
