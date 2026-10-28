'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { createFixture, createShop } = require('../support/fixture');

/**
 * The people who buy on account. Balances are the ledger's business; this is
 * only the list, and the thing it has to protect is that a customer is never
 * really deleted — their sales and payments would stop making sense.
 */
describe('the customer list', () => {
  const shop = () => createFixture().services;

  test('a new customer takes a sensible shape', async () => {
    const { customers } = shop();
    const customer = await customers.create({ name: '  Alice  ', note: 'pays on Fridays' });

    assert.equal(customer.name, 'Alice', 'trimmed');
    assert.equal(customer.note, 'pays on Fridays');
    assert.equal(customer.archived, false);
    assert.ok(customer.id);
    assert.ok(customer.createdAt);
  });

  test('refuses a customer with no name', async () => {
    const { customers } = shop();

    await assert.rejects(() => customers.create({ name: '  ' }), /Enter a customer name/);
    await assert.rejects(() => customers.create({}), /Enter a customer name/);
  });

  test('refuses a duplicate name, whatever the casing', async () => {
    const { customers } = shop();
    await customers.create({ name: 'Alice Mwangi' });

    await assert.rejects(() => customers.create({ name: 'alice mwangi' }), (error) => {
      assert.match(error.message, /already in your customers/);
      assert.equal(error.status, 409);
      return true;
    });
  });

  test('an update changes only what it was given', async () => {
    const { customers } = shop();
    const customer = await customers.create({ name: 'Alice', note: 'Fridays' });

    const updated = await customers.update(customer.id, { name: 'Alice Mwangi' });

    assert.equal(updated.name, 'Alice Mwangi');
    assert.equal(updated.note, 'Fridays');
    assert.ok(updated.updatedAt);
  });

  test('hidden customers leave the list but keep their history readable', async () => {
    const { services, alice, coffee } = await createShop();

    await services.sales.record({ customerId: alice.id, items: [{ productId: coffee.id, quantity: 1 }] });
    await services.customers.archive(alice.id);

    assert.equal(services.customers.list().find((c) => c.id === alice.id), undefined);
    assert.equal(services.customers.get(alice.id).name, 'Alice', 'the sale still knows who it was');
    assert.equal(services.ledger.positionFor(alice.id).balance, 1200, 'and what they owe is still counted');

    await services.customers.restore(alice.id);
    assert.ok(services.customers.list().some((c) => c.id === alice.id));
  });

  test('a hidden customer is left out of the balances list', async () => {
    const { services, alice, bob } = await createShop();

    await services.customers.archive(bob.id);
    const listed = services.ledger.customerPositions().map((c) => c.id);

    assert.deepEqual(listed, [alice.id]);
  });

  test('the list is alphabetical, ignoring case', async () => {
    const { customers } = shop();
    for (const name of ['bob', 'Alice', 'dana', 'Cafe Nero']) await customers.create({ name });

    assert.deepEqual(customers.list().map((c) => c.name), ['Alice', 'bob', 'Cafe Nero', 'dana']);
  });

  test('asking for a customer that is not there is refused', async () => {
    const { customers } = shop();

    assert.throws(() => customers.get('ghost'), (error) => {
      assert.match(error.message, /That customer no longer exists/);
      assert.equal(error.status, 404);
      return true;
    });
  });
});
