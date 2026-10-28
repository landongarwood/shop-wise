'use strict';

const money = require('../shared/money');
const quantity = require('../shared/quantity');
const dayRange = require('../shared/day-range');
const validate = require('../shared/validate');

/**
 * The sales ledger: one row per line of a sale.
 *
 * A sale of three products is three rows, because the questions people ask —
 * how much of this went out, what did that customer take, what moved last
 * Tuesday — are all questions about lines rather than about sales. One table
 * answers all of them given a date range and a filter, which is why there are
 * no separate per-product and per-customer summaries.
 *
 * Rows read as they were recorded: the price is the one that line actually
 * went out at and the names are the ones on the line, so a price rise or a
 * rename today does not rewrite what last month says.
 */

const MAX_ROWS = 2000;

class ReportsService {
  constructor({ saleReader, paymentReader, clock }) {
    this.saleReader = saleReader;
    this.paymentReader = paymentReader;
    this.clock = clock;
  }

  /**
   * @param {object} query
   * @param {string} [query.preset] today | yesterday | week | month | lastMonth | year | all
   * @param {string} [query.from] YYYY-MM-DD
   * @param {string} [query.to] YYYY-MM-DD
   * @param {string} [query.productId] only lines for this product
   * @param {string} [query.customerId] only sales to this customer
   */
  sales(query = {}) {
    const range = dayRange.resolve(query, this.clock);
    const productId = query.productId || null;
    const customerId = query.customerId || null;
    const limit = query.limit ? validate.integer(query.limit, 'limit', { min: 1, max: MAX_ROWS }) : MAX_ROWS;

    // Deleted sales are listed but never counted: the report is read both to
    // total up a period and to find a sale that went in wrong, and a line that
    // disappears entirely cannot be checked against the till roll.
    const inRange = this.saleReader.withDeleted().filter((sale) => dayRange.contains(range, sale.at));

    // Options are offered for the whole period, not for what is left after the
    // other filter, so a filter can always be changed rather than only cleared.
    const options = this.#options(inRange.filter(counts));

    const matching = customerId ? inRange.filter((sale) => sale.customerId === customerId) : inRange;

    const lines = matching
      .flatMap((sale) =>
        sale.items
          .filter((item) => !productId || item.productId === productId)
          .map((item) => ({
            saleId: sale.id,
            at: sale.at,
            customerId: sale.customerId,
            customerName: sale.customerName,
            productId: item.productId,
            productName: item.productName,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            note: sale.note,
            deletedAt: sale.deletedAt ?? null,
          }))
      )
      .sort(byNewest);

    const counted = lines.filter(counts);

    const payments = this.paymentReader
      .withDeleted()
      .filter((payment) => dayRange.contains(range, payment.at))
      .filter((payment) => !customerId || payment.customerId === customerId);

    const countedPayments = payments.filter(counts);

    return {
      range: { from: range.fromDay, to: range.toDay, label: range.label },
      filters: { productId, customerId },
      options,

      totals: {
        lineCount: counted.length,
        deletedCount: lines.length - counted.length,
        saleCount: new Set(counted.map((line) => line.saleId)).size,
        salesTotal: money.sum(counted.map((line) => line.lineTotal)),
        itemCount: quantity.normalise(counted.reduce((total, line) => total + line.quantity, 0)),
        paymentsCount: countedPayments.length,
        paymentsTotal: money.sum(countedPayments.map((payment) => payment.amount)),
        // Payments are never tied to a product, so a product filter cannot
        // narrow them. Say so rather than show a figure that does not match.
        paymentsApplyToFilter: !productId,
      },

      lines: lines.slice(0, limit),
      truncated: lines.length > limit,
    };
  }

  /** Everything that could be filtered on in this period, with line counts. */
  #options(sales) {
    const products = new Map();
    const customers = new Map();

    for (const sale of sales) {
      const customer = customers.get(sale.customerId) ?? { id: sale.customerId, name: sale.customerName, count: 0 };
      customer.count += sale.items.length;
      customer.name = sale.customerName;
      customers.set(sale.customerId, customer);

      for (const item of sale.items) {
        const product = products.get(item.productId) ?? { id: item.productId, name: item.productName, count: 0 };
        product.count += 1;
        product.name = item.productName;
        products.set(item.productId, product);
      }
    }

    return {
      products: [...products.values()].sort(byName),
      customers: [...customers.values()].sort(byName),
    };
  }
}

/** Deleted records are shown, never added up. */
const counts = (record) => !record.deletedAt;
const byNewest = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

module.exports = { ReportsService };
