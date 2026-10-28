'use strict';

const validate = require('../../shared/validate');

module.exports = function registerSales(router, { sales }) {
  router.get('/sales', ({ query }) =>
    sales.list({
      customerId: query.get('customerId'),
      from: validate.instant(query.get('from'), 'from'),
      to: validate.instant(query.get('to'), 'to'),
      limit: query.has('limit') ? validate.integer(query.get('limit'), 'limit', { min: 1, max: 1000 }) : 200,
    })
  );

  // Returns the sale together with any stock warnings, so the screen can say
  // "saved, but you are now showing -2 in stock" instead of refusing the sale.
  router.post('/sales', async ({ body }) => ({
    status: 201,
    payload: await sales.record(body),
  }));

  router.get('/sales/:id', ({ params }) => sales.get(params.id));

  // Deleting marks the sale rather than erasing it, so both of these answer
  // with the sale as it now stands.
  router.delete('/sales/:id', ({ params }) => sales.remove(params.id));

  router.post('/sales/:id/restore', ({ params }) => sales.restore(params.id));
};
