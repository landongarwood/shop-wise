'use strict';

const validate = require('../shared/validate');

/** The currency symbol and the level at which stock counts as low. */
class SettingsService {
  constructor({ store, clock }) {
    this.store = store;
    this.clock = clock;
  }

  get() {
    return this.store.read().settings;
  }

  async update(input) {
    const changes = {};

    if (input?.currency !== undefined) {
      changes.currency = validate.text(input.currency, 'currency symbol', { max: 4 });
    }
    if (input?.lowStockAt !== undefined) {
      changes.lowStockAt = validate.integer(input.lowStockAt, 'low stock level', { min: 0, max: 100000 });
    }

    return this.store.mutate((draft) => {
      draft.settings = { ...draft.settings, ...changes, updatedAt: this.clock.now().toISOString() };
      return draft.settings;
    });
  }
}

module.exports = { SettingsService };
