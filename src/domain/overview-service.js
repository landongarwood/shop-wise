'use strict';

const money = require('../shared/money');
const { toLocalDay } = require('../shared/clock');

/**
 * The numbers on the home screen.
 *
 * Days and months are local, not UTC: "today's takings" has to mean the day the
 * shopkeeper is standing in.
 */
class OverviewService {
  constructor({ saleReader, paymentReader, inventory, ledger, catalog, customers, settings, clock }) {
    this.saleReader = saleReader;
    this.paymentReader = paymentReader;
    this.inventory = inventory;
    this.ledger = ledger;
    this.catalog = catalog;
    this.customers = customers;
    this.settings = settings;
    this.clock = clock;
  }

  summary({ lowStockLimit = 50 } = {}) {
    const today = this.clock.today();
    const month = today.slice(0, 7);

    const sales = this.saleReader.all();
    const payments = this.paymentReader.all();
    const lowStock = this.inventory.lowStock();

    return {
      settings: this.settings.get(),
      today: this.#period(sales, payments, (day) => day === today),
      month: this.#period(sales, payments, (day) => day.startsWith(month)),
      ledger: this.ledger.totals(),
      lowStock: lowStock
        .slice(0, lowStockLimit)
        .map(({ id, name, unit, onHand }) => ({ id, name, unit, onHand })),
      lowStockCount: lowStock.length,
      counts: {
        products: this.catalog.list().length,
        customers: this.customers.list().length,
      },
    };
  }

  #period(sales, payments, matches) {
    const salesInPeriod = sales.filter((sale) => matches(toLocalDay(new Date(sale.at))));
    const paymentsInPeriod = payments.filter((payment) => matches(toLocalDay(new Date(payment.at))));

    return {
      salesCount: salesInPeriod.length,
      salesTotal: money.sum(salesInPeriod.map((sale) => sale.total)),
      paymentsCount: paymentsInPeriod.length,
      paymentsTotal: money.sum(paymentsInPeriod.map((payment) => payment.amount)),
    };
  }
}

module.exports = { OverviewService };
