'use strict';

const validate = require('../shared/validate');
const { conflict } = require('../errors');

/** The people who buy on account. Balances live in the ledger, not here. */
class CustomerService {
  constructor({ customers, clock, ids }) {
    this.customers = customers;
    this.clock = clock;
    this.ids = ids;
  }

  list({ includeArchived = false } = {}) {
    const rows = this.customers.all();
    return (includeArchived ? rows : rows.filter((customer) => !customer.archived)).slice().sort(byName);
  }

  get(id) {
    return this.customers.get(id);
  }

  async create(input) {
    const name = validate.text(input?.name, 'customer name');
    const phone = validate.text(input?.phone, 'phone', { required: false, max: 40 });
    const note = validate.text(input?.note, 'note', { required: false, max: 300 });

    this.#refuseDuplicateName(name);

    return this.customers.add({
      id: this.ids.next(),
      name,
      phone,
      note,
      archived: false,
      createdAt: this.clock.now().toISOString(),
    });
  }

  async update(id, input) {
    const existing = this.customers.get(id);
    const changes = {};

    if (input?.name !== undefined) {
      changes.name = validate.text(input.name, 'customer name');
      this.#refuseDuplicateName(changes.name, id);
    }
    if (input?.phone !== undefined) {
      changes.phone = validate.text(input.phone, 'phone', { required: false, max: 40 });
    }
    if (input?.note !== undefined) {
      changes.note = validate.text(input.note, 'note', { required: false, max: 300 });
    }
    if (input?.archived !== undefined) {
      changes.archived = Boolean(input.archived);
    }

    changes.updatedAt = this.clock.now().toISOString();
    return this.customers.patch(existing.id, changes);
  }

  /** Hidden, not deleted: their sales and payments stay in the books. */
  async archive(id) {
    return this.update(id, { archived: true });
  }

  async restore(id) {
    return this.update(id, { archived: false });
  }

  #refuseDuplicateName(name, exceptId = null) {
    const clash = this.customers
      .all()
      .find((customer) => customer.id !== exceptId && !customer.archived && sameName(customer.name, name));

    if (clash) throw conflict(`"${name}" is already in your customers.`);
  }
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

module.exports = { CustomerService };
