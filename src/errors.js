'use strict';

/**
 * Errors that carry how the HTTP layer should present them.
 *
 * `expose` marks a message as safe and useful to show the shopkeeper. Anything
 * without it is treated as our bug and reported as a generic failure, so an
 * internal detail never reaches the screen.
 */
class AppError extends Error {
  constructor(message, { status = 500, expose = false, code } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.expose = expose;
    this.code = code;
  }
}

const badRequest = (message, code) => new AppError(message, { status: 400, expose: true, code });
const notFound = (message, code) => new AppError(message, { status: 404, expose: true, code });
const conflict = (message, code) => new AppError(message, { status: 409, expose: true, code });

module.exports = { AppError, badRequest, notFound, conflict };
