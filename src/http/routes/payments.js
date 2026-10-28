'use strict';

const validate = require('../../shared/validate');

module.exports = function registerPayments(router, { ledger }) {
  router.get('/payments', ({ query }) =>
    ledger.paymentsList({
      customerId: query.get('customerId'),
      from: validate.instant(query.get('from'), 'from'),
      to: validate.instant(query.get('to'), 'to'),
      limit: query.has('limit') ? validate.integer(query.get('limit'), 'limit', { min: 1, max: 1000 }) : 200,
    })
  );

  router.post('/payments', async ({ body }) => ({
    status: 201,
    payload: await ledger.recordPayment(body),
  }));

  router.delete('/payments/:id', ({ params }) => ledger.removePayment(params.id));
};
