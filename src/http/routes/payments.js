'use strict';

const validate = require('../../shared/validate');
const dayRange = require('../../shared/day-range');

/** from/to as whole days, for the list endpoints that take them. */
const dates = (query) => {
  const { fromIso, toIso } = dayRange.boundsFor(query.get('from'), query.get('to'));
  return { from: fromIso, to: toIso };
};

module.exports = function registerPayments(router, { ledger }) {
  router.get('/payments', ({ query }) =>
    ledger.paymentsList({
      customerId: query.get('customerId'),
      // A day means the whole day, both ends.
      ...dates(query),
      limit: query.has('limit') ? validate.integer(query.get('limit'), 'limit', { min: 1, max: 1000 }) : 200,
    })
  );

  router.post('/payments', async ({ body }) => ({
    status: 201,
    payload: await ledger.recordPayment(body),
  }));

  router.delete('/payments/:id', ({ params }) => ledger.removePayment(params.id));
};
