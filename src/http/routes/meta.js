'use strict';

/** Build and environment facts the UI shows on the settings screen. */
module.exports = function registerMeta(router, { config, store, settings }) {
  router.get('/meta', () => ({
    product: config.productName,
    version: config.version,
    installed: config.installed,
    dataDir: config.dataDir,
    storage: store.describe(),
    settings: settings.get(),
  }));

  router.get('/health', () => ({ ok: true, at: new Date().toISOString() }));
};
