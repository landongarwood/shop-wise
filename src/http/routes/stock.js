'use strict';

const validate = require('../../shared/validate');

module.exports = function registerStock(router, { inventory }) {
  // Products with their current stock position: what both the stock screen and
  // the sell screen need.
  router.get('/stock', ({ query }) =>
    inventory.levels({ includeArchived: query.get('includeArchived') === 'true' })
  );

  router.get('/stock/low', () => inventory.lowStock());

  router.post('/stock', async ({ body }) => ({
    status: 201,
    payload: await inventory.addStock(body),
  }));

  router.get('/stock/products/:productId/entries', ({ params, query }) =>
    inventory.entriesFor(params.productId, {
      limit: query.has('limit') ? validate.integer(query.get('limit'), 'limit', { min: 1, max: 200 }) : 20,
      offset: query.has('offset') ? validate.integer(query.get('offset'), 'offset', { min: 0 }) : 0,
    })
  );

  router.delete('/stock/entries/:id', async ({ params }) => ({
    removed: await inventory.removeStockEntry(params.id),
  }));
};
