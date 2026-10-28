'use strict';

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

  router.get('/stock/products/:productId/entries', ({ params }) => inventory.entriesFor(params.productId));

  router.delete('/stock/entries/:id', async ({ params }) => ({
    removed: await inventory.removeStockEntry(params.id),
  }));
};
