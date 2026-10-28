'use strict';

module.exports = function registerSettings(router, { settings }) {
  router.get('/settings', () => settings.get());

  router.patch('/settings', ({ body }) => settings.update(body));
};
