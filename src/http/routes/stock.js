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

  // Everything that moved this product: deliveries in and sales out together.
  // A whole delivery at once: all of it is written, or none of it is.
  router.post('/stock/batch', async ({ body }) => ({
    status: 201,
    payload: await inventory.addStockBatch(body),
  }));

  router.get('/stock/products/:productId/movements', ({ params, query }) =>
    inventory.movementsFor(params.productId, {
      limit: query.has('limit') ? validate.integer(query.get('limit'), 'limit', { min: 1, max: 200 }) : 25,
      offset: query.has('offset') ? validate.integer(query.get('offset'), 'offset', { min: 0 }) : 0,
    })
  );

  router.delete('/stock/entries/:id', ({ params }) => inventory.removeStockEntry(params.id));

  router.post('/stock/entries/:id/restore', ({ params }) => inventory.restoreStockEntry(params.id));
};
