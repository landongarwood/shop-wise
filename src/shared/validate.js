'use strict';

const { badRequest } = require('../errors');

/** Small, shared input checks. Each returns the cleaned value. */

function text(input, field, { max = 120, required = true } = {}) {
  const value = typeof input === 'string' ? input.trim() : '';

  if (!value) {
    if (required) throw badRequest(`Enter a ${field}.`);
    return '';
  }
  if (value.length > max) throw badRequest(`${capitalise(field)} is too long (max ${max} characters).`);

  return value;
}

function id(input, field) {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) throw badRequest(`Choose a ${field}.`);
  return value;
}

/** An ISO instant, or a YYYY-MM-DD day which is anchored to local noon. */
function instant(input, field = 'date') {
  if (input === null || input === undefined || input === '') return null;

  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split('-').map(Number);
    // Noon local time: the day a sale belongs to never shifts under a timezone
    // or daylight-saving change.
    return new Date(year, month - 1, day, 12, 0, 0).toISOString();
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) throw badRequest(`${capitalise(field)} is not a valid date.`);
  return date.toISOString();
}

function array(input, field, { min = 1 } = {}) {
  if (!Array.isArray(input) || input.length < min) {
    throw badRequest(`Add at least ${min} ${field}.`);
  }
  return input;
}

function integer(input, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(input);
  if (!Number.isInteger(value)) throw badRequest(`${capitalise(field)} must be a whole number.`);
  if (value < min || value > max) throw badRequest(`${capitalise(field)} must be between ${min} and ${max}.`);
  return value;
}

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1);

module.exports = { text, id, instant, array, integer };
