'use strict';

module.exports = function registerProducts(router, { catalog }) {
  router.get('/products', ({ query }) =>
    catalog.list({ includeArchived: query.get('includeArchived') === 'true' })
  );

  router.post('/products', async ({ body }) => ({
    status: 201,
    payload: await catalog.create(body),
  }));

  router.patch('/products/:id', ({ params, body }) => catalog.update(params.id, body));

  // Hiding rather than deleting: past sales still refer to this product.
  router.delete('/products/:id', async ({ params }) => catalog.archive(params.id));
};
