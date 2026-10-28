'use strict';

module.exports = function registerOverview(router, { overview }) {
  router.get('/overview', () => overview.summary());
};
