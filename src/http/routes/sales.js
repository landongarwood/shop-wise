'use strict';

const validate = require('../../shared/validate');
const dayRange = require('../../shared/day-range');

/** from/to as whole days, for the list endpoints that take them. */
const dates = (query) => {
  const { fromIso, toIso } = dayRange.boundsFor(query.get('from'), query.get('to'));
  return { from: fromIso, to: toIso };
};

module.exports = function registerSales(router, { sales }) {
  router.get('/sales', ({ query }) =>
    sales.list({
      customerId: query.get('customerId'),
      // A day means the whole day, both ends.
      ...dates(query),
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

  // Deleting marks the sale rather than erasing it, so this answers with the
  // sale as it now stands.
  router.delete('/sales/:id', ({ params }) => sales.remove(params.id));
};
