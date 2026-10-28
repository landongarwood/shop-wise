'use strict';

const money = require('../shared/money');
const quantity = require('../shared/quantity');
const validate = require('../shared/validate');
const { resolveInstant } = require('../shared/clock');

/**
 * Recording what went out of the shop and to whom.
 *
 * Two things matter here:
 *
 * 1. The price on a sale line is the price that was actually agreed. It starts
 *    from the product's usual price but is free to differ, so the line carries
 *    its own `unitPrice` and the catalogue is never rewritten by a sale.
 * 2. Each line snapshots the product's name and unit. Renaming a product next
 *    month must not change what last month's receipt says.
 *
 * Selling more than the recorded stock is allowed but reported back as a
 * warning: a shopkeeper often has goods the books have not caught up with, and
 * blocking the sale would be worse than flagging it.
 */
class SalesService {
  constructor({ sales, catalog, customers, inventory, clock, ids }) {
    this.sales = sales;
    this.catalog = catalog;
    this.customers = customers;
    this.inventory = inventory;
    this.clock = clock;
    this.ids = ids;
  }

  async record(input) {
    const customerId = validate.id(input?.customerId, 'customer');
    const customer = this.customers.get(customerId);
    const lines = validate.array(input?.items, 'product', { min: 1 });
    const at = resolveInstant(input?.at, this.clock);
    const note = validate.text(input?.note, 'note', { required: false, max: 200 });

    const items = lines.map((line) => this.#buildItem(line));
    const total = money.sum(items.map((item) => item.lineTotal));

    const sale = {
      id: this.ids.next(),
      customerId,
      customerName: customer.name, // snapshot, for the same reason as product names
      at,
      items,
      total,
      note,
      createdAt: this.clock.now().toISOString(),
    };

    const warnings = this.#stockWarnings(items);
    await this.sales.add(sale);

    return { sale, warnings };
  }

  list({ customerId = null, from = null, to = null, limit = 200 } = {}) {
    return this.sales
      .all()
      .filter((sale) => (customerId ? sale.customerId === customerId : true))
      .filter((sale) => (from ? sale.at >= from : true))
      .filter((sale) => (to ? sale.at <= to : true))
      .sort(byNewest)
      .slice(0, limit);
  }

  get(id) {
    return this.sales.get(id);
  }

  /**
   * Deletes a sale. Mis-keyed sales are common and the shopkeeper has no other
   * way to fix one; stock and balances both follow from the movements, so this
   * undoes its effect everywhere at once.
   *
   * The sale is marked, not erased: it still appears in the product's history
   * and in the customer's, struck through. A shop's books are a record of what
   * happened, including the mistakes.
   */
  async remove(id) {
    this.sales.get(id); // refuse unknown ids rather than silently succeeding
    return this.sales.softDelete(id, this.clock.now().toISOString());
  }

  #buildItem(line) {
    const productId = validate.id(line?.productId, 'product');
    const product = this.catalog.get(productId);
    const amount = quantity.parse(line?.quantity, 'quantity');

    // An omitted price means "the usual one"; zero is a deliberate giveaway and
    // is left alone.
    const unitPrice =
      line?.unitPrice === undefined || line?.unitPrice === null || line?.unitPrice === ''
        ? product.price
        : money.parseMinor(line.unitPrice, 'price');

    return {
      productId,
      productName: product.name,
      unit: product.unit,
      quantity: amount,
      unitPrice,
      lineTotal: money.multiply(unitPrice, amount),
    };
  }

  #stockWarnings(items) {
    const totals = this.inventory.movementTotals();

    return items
      .map((item) => {
        const onHand = totals.get(item.productId)?.onHand ?? 0;
        if (onHand >= item.quantity) return null;

        return {
          productId: item.productId,
          productName: item.productName,
          onHand,
          requested: item.quantity,
          message:
            onHand <= 0
              ? `${item.productName} has no stock recorded.`
              : `Only ${onHand} ${item.unit} of ${item.productName} recorded in stock.`,
        };
      })
      .filter(Boolean);
  }
}

const byNewest = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

module.exports = { SalesService };
