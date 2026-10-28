'use strict';

module.exports = function registerReports(router, { reports }) {
  // What was sold over a period: totals, best sellers, biggest buyers, per day.
  router.get('/reports/sales', ({ query }) =>
    reports.sales({
      preset: query.get('preset') ?? undefined,
      from: query.get('from') ?? undefined,
      to: query.get('to') ?? undefined,
    })
  );
};
