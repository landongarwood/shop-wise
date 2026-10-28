'use strict';

const registerMeta = require('./meta');
const registerSettings = require('./settings');
const registerProducts = require('./products');
const registerStock = require('./stock');
const registerCustomers = require('./customers');
const registerSales = require('./sales');
const registerPayments = require('./payments');
const registerOverview = require('./overview');
const registerReports = require('./reports');

/**
 * Collects the route modules. Each one owns its own endpoints, so a new area of
 * the app is a new file here rather than an edit to a shared table.
 */
function registerRoutes(router, services) {
  for (const register of [
    registerMeta,
    registerSettings,
    registerProducts,
    registerStock,
    registerCustomers,
    registerSales,
    registerPayments,
    registerOverview,
    registerReports,
  ]) {
    register(router, services);
  }
  return router;
}

module.exports = { registerRoutes };
