'use strict';

const quantity = require('../shared/quantity');
const validate = require('../shared/validate');
const { badRequest } = require('../errors');

/**
 * Stock, derived from movements rather than stored as a counter.
 *
 *   on hand = everything added in - everything sold
 *
 * Nothing writes a stock figure anywhere, so a stock number can never drift
 * away from the entries that explain it. Correcting a mistake means adding or
 * removing a movement, which leaves a trail.
 */
class InventoryService {
  /**
   * @param {object} deps
   * @param {object} deps.stockEntries repository of stock-in movements
   * @param {{all:Function}} deps.saleReader read-only view of sales
   * @param {object} deps.catalog
   * @param {{get:Function}} deps.settings supplies the low-stock threshold
   */
  constructor({ stockEntries, saleReader, catalog, settings, clock, ids }) {
    this.stockEntries = stockEntries;
    this.saleReader = saleReader;
    this.catalog = catalog;
    this.settings = settings;
    this.clock = clock;
    this.ids = ids;
  }

  /** Adds a delivery or an opening count to stock. */
  async addStock(input) {
    const productId = validate.id(input?.productId, 'product');
    const product = this.catalog.get(productId);
    const amount = quantity.parse(input?.quantity, 'quantity');
    const at = validate.instant(input?.at) ?? this.clock.now().toISOString();
    const note = validate.text(input?.note, 'note', { required: false, max: 200 });

    if (product.archived) throw badRequest(`"${product.name}" is hidden. Restore it before adding stock.`);

    return this.stockEntries.add({
      id: this.ids.next(),
      productId,
      productName: product.name, // snapshot: renaming a product later must not rewrite history
      quantity: amount,
      at,
      note,
      createdAt: this.clock.now().toISOString(),
    });
  }

  /** Removes a stock entry, for when a delivery was keyed in wrongly. */
  async removeStockEntry(id) {
    return this.stockEntries.remove(id);
  }

  entriesFor(productId, { limit = 50 } = {}) {
    return this.stockEntries
      .all()
      .filter((entry) => entry.productId === productId)
      .sort(byNewest)
      .slice(0, limit);
  }

  /** @returns {Map<string, {added:number, sold:number, onHand:number}>} */
  movementTotals() {
    const totals = new Map();
    const bucket = (productId) => {
      if (!totals.has(productId)) totals.set(productId, { added: 0, sold: 0, onHand: 0 });
      return totals.get(productId);
    };

    for (const entry of this.stockEntries.all()) {
      bucket(entry.productId).added += entry.quantity;
    }
    for (const sale of this.saleReader.all()) {
      for (const item of sale.items) bucket(item.productId).sold += item.quantity;
    }

    for (const total of totals.values()) {
      total.added = quantity.normalise(total.added);
      total.sold = quantity.normalise(total.sold);
      total.onHand = quantity.normalise(total.added - total.sold);
    }
    return totals;
  }

  /** Every visible product with its stock position, ready for the stock screen. */
  levels({ includeArchived = false } = {}) {
    const totals = this.movementTotals();
    const lowStockAt = this.#lowStockThreshold();

    return this.catalog.list({ includeArchived }).map((product) => {
      const total = totals.get(product.id) ?? { added: 0, sold: 0, onHand: 0 };
      return {
        ...product,
        added: total.added,
        sold: total.sold,
        onHand: total.onHand,
        low: total.onHand <= lowStockAt,
      };
    });
  }

  onHand(productId) {
    return this.movementTotals().get(productId)?.onHand ?? 0;
  }

  lowStock() {
    return this.levels().filter((product) => product.low);
  }

  #lowStockThreshold() {
    return this.settings.get().lowStockAt ?? 0;
  }
}

const byNewest = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

module.exports = { InventoryService };
