'use strict';

const money = require('../shared/money');
const validate = require('../shared/validate');
const { resolveInstant } = require('../shared/clock');

/**
 * What each customer owes, and what they have paid.
 *
 * Customers here do not pay at the till. They take goods through the month and
 * settle whenever they choose, in whatever amounts they choose, so there is no
 * such thing as a "paid" sale — there is only a running position per customer:
 *
 *   balance = everything charged - everything paid
 *
 * A positive balance is debt. A negative one means they have paid ahead, which
 * happens when someone rounds a payment up or settles before the goods go out,
 * so it is a normal state and is reported as credit rather than treated as an
 * error. Payments are never matched to particular sales: doing so would invent
 * a link the shop does not actually make.
 */

const STATUS = Object.freeze({ owes: 'owes', settled: 'settled', credit: 'credit' });

class LedgerService {
  constructor({ payments, saleReader, customers, clock, ids }) {
    this.payments = payments;
    this.saleReader = saleReader;
    this.customers = customers;
    this.clock = clock;
    this.ids = ids;
  }

  async recordPayment(input) {
    const customerId = validate.id(input?.customerId, 'customer');
    const customer = this.customers.get(customerId);
    const amount = money.parseMinor(input?.amount, 'amount');
    const at = resolveInstant(input?.at, this.clock);
    const note = validate.text(input?.note, 'note', { required: false, max: 200 });

    return this.payments.add({
      id: this.ids.next(),
      customerId,
      customerName: customer.name,
      amount,
      at,
      note,
      createdAt: this.clock.now().toISOString(),
    });
  }

  /**
   * A payment keyed in wrongly stops counting against the customer's balance,
   * but stays on their history, struck through.
   */
  async removePayment(id) {
    this.payments.get(id);
    return this.payments.softDelete(id, this.clock.now().toISOString());
  }

  paymentsList({ customerId = null, from = null, to = null, limit = 200 } = {}) {
    return this.payments
      .all()
      .filter((payment) => (customerId ? payment.customerId === customerId : true))
      .filter((payment) => (from ? payment.at >= from : true))
      .filter((payment) => (to ? payment.at <= to : true))
      .sort(byNewest)
      .slice(0, limit);
  }

  /**
   * @returns {Map<string, {charged:number, paid:number, balance:number, status:string, lastVisit:string|null}>}
   */
  positions() {
    const positions = new Map();
    const bucket = (customerId) => {
      if (!positions.has(customerId)) positions.set(customerId, { ...NO_POSITION });
      return positions.get(customerId);
    };

    // Buying and paying both count as coming in: either way the shopkeeper saw
    // them that day, which is what "last visited" is asked in order to know.
    for (const sale of this.saleReader.all()) {
      const position = bucket(sale.customerId);
      position.charged += sale.total;
      position.lastVisit = later(position.lastVisit, sale.at);
    }
    for (const payment of this.payments.all()) {
      const position = bucket(payment.customerId);
      position.paid += payment.amount;
      position.lastVisit = later(position.lastVisit, payment.at);
    }

    for (const position of positions.values()) {
      position.balance = position.charged - position.paid;
      position.status = statusOf(position.balance);
    }
    return positions;
  }

  positionFor(customerId) {
    return this.positions().get(customerId) ?? { ...NO_POSITION, status: STATUS.settled };
  }

  /** Every visible customer with their position, ready for the customers screen. */
  customerPositions() {
    const positions = this.positions();

    return this.customers.list().map((customer) => ({
      ...customer,
      ...(positions.get(customer.id) ?? { ...NO_POSITION, status: STATUS.settled }),
    }));
  }

  /**
   * One customer's history: sales and payments on a single timeline, newest
   * first, each carrying the balance as it stood after that event.
   */
  statement(customerId, { limit = 100 } = {}) {
    const customer = this.customers.get(customerId);

    // Deleted entries are included here and nowhere else: this is the record
    // of what happened to the account, and a line that was taken back is part
    // of that. They are marked, and they move no money.
    const events = [
      ...this.saleReader
        .withDeleted()
        .filter((sale) => sale.customerId === customerId)
        .map((sale) => ({
          kind: 'sale',
          id: sale.id,
          at: sale.at,
          amount: sale.total,
          items: sale.items,
          note: sale.note,
          deletedAt: sale.deletedAt ?? null,
        })),
      ...this.payments
        .withDeleted()
        .filter((payment) => payment.customerId === customerId)
        .map((payment) => ({
          kind: 'payment',
          id: payment.id,
          at: payment.at,
          amount: payment.amount,
          note: payment.note,
          deletedAt: payment.deletedAt ?? null,
        })),
    ].sort(byOldest);

    // Walk forward to attach a running balance, then show newest first. A
    // deleted entry leaves the balance where it was, so the figures beside it
    // still read as the account actually stood.
    let running = 0;
    for (const event of events) {
      if (!event.deletedAt) running += event.kind === 'sale' ? event.amount : -event.amount;
      event.balanceAfter = running;
    }

    const position = this.positionFor(customerId);

    return {
      customer,
      ...position,
      entries: events.reverse().slice(0, limit),
      // Two different questions: how long the list is, and how much of it
      // counts. The deleted ones are in the first and not the second.
      entryCount: events.length,
      countedEntryCount: events.filter((event) => !event.deletedAt).length,
    };
  }

  /** Shop-wide: how much is out there, and how much has been paid ahead. */
  totals() {
    let receivable = 0;
    let credit = 0;

    for (const position of this.positions().values()) {
      if (position.balance > 0) receivable += position.balance;
      else credit += -position.balance;
    }
    return { receivable, credit };
  }
}

/** A customer nothing has happened to yet. Spread, never shared. */
const NO_POSITION = Object.freeze({ charged: 0, paid: 0, balance: 0, status: STATUS.settled, lastVisit: null });

// ISO instants sort as text, which is why dates are stored this way.
const later = (a, b) => (a === null || b > a ? b : a);
const statusOf = (balance) => (balance > 0 ? STATUS.owes : balance < 0 ? STATUS.credit : STATUS.settled);
const byNewest = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
const byOldest = (a, b) => (a.at > b.at ? 1 : a.at < b.at ? -1 : 0);

module.exports = { LedgerService };
