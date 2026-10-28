'use strict';

const validate = require('../../shared/validate');

module.exports = function registerCustomers(router, { customers, ledger }) {
  // Customers arrive with their balance already worked out: the list screen
  // exists to show who owes what.
  router.get('/customers', () => ledger.customerPositions());

  router.post('/customers', async ({ body }) => ({
    status: 201,
    payload: await customers.create(body),
  }));

  router.patch('/customers/:id', ({ params, body }) => customers.update(params.id, body));

  router.delete('/customers/:id', ({ params }) => customers.archive(params.id));

  router.get('/customers/:id/statement', ({ params, query }) =>
    ledger.statement(params.id, {
      limit: query.has('limit') ? validate.integer(query.get('limit'), 'limit', { min: 1, max: 1000 }) : 100,
    })
  );
};
