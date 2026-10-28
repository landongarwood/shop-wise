'use strict';

const money = require('../shared/money');
const validate = require('../shared/validate');
const { conflict } = require('../errors');

/**
 * The product list: names, units and the usual selling price.
 *
 * The price held here is the default a sale starts from, not a fixed one. What
 * a product actually sold for is recorded on the sale itself, because the same
 * goods go out at different prices on different days.
 */
class CatalogService {
  constructor({ products, clock, ids }) {
    this.products = products;
    this.clock = clock;
    this.ids = ids;
  }

  list({ includeArchived = false } = {}) {
    const rows = this.products.all();
    return (includeArchived ? rows : rows.filter((product) => !product.archived)).slice().sort(byName);
  }

  get(id) {
    return this.products.get(id);
  }

  async create(input) {
    const name = validate.text(input?.name, 'product name');
    const unit = validate.text(input?.unit, 'unit', { required: false, max: 16 }) || 'pcs';
    const price = money.parseMinor(input?.price ?? 0, 'price');

    this.#refuseDuplicateName(name);

    return this.products.add({
      id: this.ids.next(),
      name,
      unit,
      price,
      archived: false,
      createdAt: this.clock.now().toISOString(),
    });
  }

  async update(id, input) {
    const existing = this.products.get(id);
    const changes = {};

    if (input?.name !== undefined) {
      changes.name = validate.text(input.name, 'product name');
      this.#refuseDuplicateName(changes.name, id);
    }
    if (input?.unit !== undefined) {
      changes.unit = validate.text(input.unit, 'unit', { required: false, max: 16 }) || 'pcs';
    }
    if (input?.price !== undefined) {
      changes.price = money.parseMinor(input.price, 'price');
    }
    if (input?.archived !== undefined) {
      changes.archived = Boolean(input.archived);
    }

    changes.updatedAt = this.clock.now().toISOString();
    return this.products.patch(existing.id, changes);
  }

  /**
   * Products are hidden rather than deleted: past sales refer to them, and the
   * history has to keep making sense.
   */
  async archive(id) {
    return this.update(id, { archived: true });
  }

  async restore(id) {
    return this.update(id, { archived: false });
  }

  #refuseDuplicateName(name, exceptId = null) {
    const clash = this.products
      .all()
      .find((product) => product.id !== exceptId && !product.archived && sameName(product.name, name));

    if (clash) throw conflict(`"${name}" is already in your products.`);
  }
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

module.exports = { CatalogService };
