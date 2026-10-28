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

  /**
   * Takes in a whole delivery at once.
   *
   * Several products arriving together is the normal case, not the exception.
   * Every line is checked before any of it is written, so a delivery is either
   * recorded or refused — never half-entered, which would leave stock figures
   * that nobody can reconcile against the paperwork.
   *
   * @param {{lines: Array<{productId: string, quantity: number|string}>, note?: string, at?: string}} input
   */
  async addStockBatch(input) {
    const lines = validate.array(input?.lines, 'product', { min: 1 });
    const at = validate.instant(input?.at) ?? this.clock.now().toISOString();
    const note = validate.text(input?.note, 'note', { required: false, max: 200 });
    const createdAt = this.clock.now().toISOString();

    const entries = lines.map((line) => {
      const productId = validate.id(line?.productId, 'product');
      const product = this.catalog.get(productId);

      if (product.archived) throw badRequest(`"${product.name}" is hidden. Restore it before adding stock.`);

      return {
        id: this.ids.next(),
        productId,
        productName: product.name, // snapshot, as elsewhere
        quantity: quantity.parse(line?.quantity, 'quantity'),
        at,
        note,
        createdAt,
      };
    });

    // One product cannot appear twice: two lines for the same thing is a
    // mis-key, and silently adding both would be the wrong guess.
    const seen = new Set();
    for (const entry of entries) {
      if (seen.has(entry.productId)) {
        throw badRequest(`"${entry.productName}" is on this delivery twice. Put the whole amount on one line.`);
      }
      seen.add(entry.productId);
    }

    return this.stockEntries.addMany(entries);
  }

  /**
   * Takes a delivery back off the books, for when it was keyed in wrongly.
   * It stays in the product's history, struck through.
   */
  async removeStockEntry(id) {
    this.stockEntries.get(id);
    return this.stockEntries.softDelete(id, this.clock.now().toISOString());
  }

  /**
   * One page of everything that has moved a product, newest first: deliveries
   * in and sales out, on a single timeline, each carrying who or why.
   *
   * Stock only makes sense as the difference between the two, so showing one
   * without the other invites the question "sold to whom?" and then offers no
   * way to answer it.
   *
   * The count comes back with it, because a list that silently stops at its
   * limit is worse than a short one: nothing says there is more behind it.
   *
   * @returns {{entries: object[], total: number, hasMore: boolean}}
   */
  movementsFor(productId, { limit = 25, offset = 0 } = {}) {
    // History, unlike every other reader, asks for the deleted ones too: a
    // movement that was taken back still happened, and a row that simply
    // vanished would leave the shopkeeper wondering what they had done.
    const takenIn = this.stockEntries
      .withDeleted()
      .filter((entry) => entry.productId === productId)
      .map((entry) => ({
        kind: 'in',
        id: entry.id,
        at: entry.at,
        quantity: entry.quantity,
        who: '',
        note: entry.note ?? '',
        deletedAt: entry.deletedAt ?? null,
      }));

    const sold = this.saleReader.withDeleted().flatMap((sale) =>
      sale.items
        .filter((item) => item.productId === productId)
        .map((item) => ({
          kind: 'sold',
          id: sale.id,
          at: sale.at,
          quantity: item.quantity,
          who: sale.customerName,
          customerId: sale.customerId,
          note: sale.note ?? '',
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          // What removing this row would really take with it.
          saleItemCount: sale.items.length,
          saleTotal: sale.total,
          deletedAt: sale.deletedAt ?? null,
        }))
    );

    const all = [...takenIn, ...sold].sort(byNewest);

    return {
      entries: all.slice(offset, offset + limit),
      total: all.length,
      hasMore: offset + limit < all.length,
    };
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
