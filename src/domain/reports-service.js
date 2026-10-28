'use strict';

const money = require('../shared/money');
const quantity = require('../shared/quantity');
const dayRange = require('../shared/day-range');
const { toLocalDay } = require('../shared/clock');

/**
 * What was sold over a stretch of time, and to whom.
 *
 * The report reads the sale lines as they were recorded, not today's catalogue:
 * revenue uses the price each line actually went out at, and the product name
 * is the one on the line. A price rise this week therefore does not rewrite
 * last month's takings.
 */
class ReportsService {
  constructor({ saleReader, paymentReader, clock }) {
    this.saleReader = saleReader;
    this.paymentReader = paymentReader;
    this.clock = clock;
  }

  /**
   * @param {{preset?:string, from?:string, to?:string}} period
   */
  sales(period = {}) {
    const range = dayRange.resolve(period, this.clock);

    const sales = this.saleReader.all().filter((sale) => dayRange.contains(range, sale.at));
    const payments = this.paymentReader.all().filter((payment) => dayRange.contains(range, payment.at));

    return {
      range: { from: range.fromDay, to: range.toDay, label: range.label },

      totals: {
        salesCount: sales.length,
        salesTotal: money.sum(sales.map((sale) => sale.total)),
        paymentsCount: payments.length,
        paymentsTotal: money.sum(payments.map((payment) => payment.amount)),
        itemCount: quantity.normalise(
          sales.flatMap((sale) => sale.items).reduce((total, item) => total + item.quantity, 0)
        ),
      },

      byProduct: this.#byProduct(sales),
      byCustomer: this.#byCustomer(sales),
      byDay: this.#byDay(sales, payments),
      sales: sales.slice().sort(byNewest),
    };
  }

  /** Best sellers by revenue: the usual question is "what makes the money". */
  #byProduct(sales) {
    const totals = new Map();

    for (const sale of sales) {
      for (const item of sale.items) {
        const row =
          totals.get(item.productId) ??
          {
            productId: item.productId,
            productName: item.productName,
            unit: item.unit,
            quantity: 0,
            revenue: 0,
            saleCount: 0,
          };

        row.quantity += item.quantity;
        row.revenue += item.lineTotal;
        row.saleCount += 1;
        // Keep the most recent name, which is the one the user recognises.
        row.productName = item.productName;
        totals.set(item.productId, row);
      }
    }

    return [...totals.values()]
      .map((row) => ({
        ...row,
        quantity: quantity.normalise(row.quantity),
        averagePrice: row.quantity > 0 ? Math.round(row.revenue / row.quantity) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  #byCustomer(sales) {
    const totals = new Map();

    for (const sale of sales) {
      const row = totals.get(sale.customerId) ?? {
        customerId: sale.customerId,
        customerName: sale.customerName,
        total: 0,
        saleCount: 0,
      };

      row.total += sale.total;
      row.saleCount += 1;
      totals.set(sale.customerId, row);
    }

    return [...totals.values()].sort((a, b) => b.total - a.total);
  }

  /** One row per day that had activity, oldest first, for a simple trend. */
  #byDay(sales, payments) {
    const days = new Map();
    const bucket = (day) => {
      if (!days.has(day)) days.set(day, { day, salesTotal: 0, salesCount: 0, paymentsTotal: 0 });
      return days.get(day);
    };

    for (const sale of sales) {
      const row = bucket(toLocalDay(new Date(sale.at)));
      row.salesTotal += sale.total;
      row.salesCount += 1;
    }
    for (const payment of payments) {
      bucket(toLocalDay(new Date(payment.at))).paymentsTotal += payment.amount;
    }

    return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  }
}

const byNewest = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

module.exports = { ReportsService };
