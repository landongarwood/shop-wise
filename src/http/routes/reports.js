'use strict';

module.exports = function registerReports(router, { reports }) {
  // The sales ledger for a period: one row per line of a sale, optionally
  // narrowed to a single product or customer.
  router.get('/reports/sales', ({ query }) =>
    reports.sales({
      preset: query.get('preset') ?? undefined,
      from: query.get('from') ?? undefined,
      to: query.get('to') ?? undefined,
      productId: query.get('productId') ?? undefined,
      customerId: query.get('customerId') ?? undefined,
      limit: query.get('limit') ?? undefined,
    })
  );
};
