import { div, button, append, clear } from '../core/dom.js';
import { toastOk } from '../core/toast.js';
import { searchBox } from '../widgets/pickers.js';
import { openNewCustomerSheet } from '../widgets/forms.js';
import { badge, emptyState, stat } from '../widgets/states.js';

/**
 * Who owes what.
 *
 * Sorted by debt, largest first, because the reason to open this screen is
 * almost always to see who has not paid. Everyone settled sits at the bottom
 * out of the way.
 */
export async function customers(ctx) {
  const { api, format, go, reload } = ctx;

  const people = await api.get('/customers');

  const addCustomer = async () => {
    const created = await openNewCustomerSheet({ api });
    if (created) {
      toastOk(`${created.name} added`);
      await reload();
    }
  };

  if (!people.length) {
    return {
      title: 'Customers',
      body: emptyState({
        title: 'No customers yet',
        message: 'Add the people who buy from you, so you can keep track of what they owe.',
        actionLabel: 'Add a customer',
        actionIcon: 'userPlus',
        onAction: addCustomer,
      }),
    };
  }

  const sorted = people.slice().sort(byDebtThenName);

  const owed = sorted.reduce((sum, person) => sum + Math.max(0, person.balance), 0);
  const credit = sorted.reduce((sum, person) => sum + Math.max(0, -person.balance), 0);

  const rows = div({ class: 'rows' });

  const draw = (term = '') => {
    clear(rows);

    const matches = term
      ? sorted.filter((person) => `${person.name} ${person.phone ?? ''}`.toLowerCase().includes(term))
      : sorted;

    if (!matches.length) {
      append(rows, div({ class: 'row row--static' }, div({ class: 'soft', text: 'Nothing matches that.' })));
      return;
    }

    append(
      rows,
      matches.map((person) => {
        const position = format.balance(person.balance);

        return button({ class: 'row', onclick: () => go('customer', { id: person.id }) }, [
          div({ class: 'row__main' }, [
            div({ class: 'row__title', text: person.name }),
            div({
              class: 'row__sub',
              text: person.phone || `${format.money(person.charged)} bought in total`,
            }),
          ]),
          badge(position.text, position.tone),
        ]);
      })
    );
  };

  const search = searchBox({ placeholder: 'Search customers', onChange: draw });
  draw();

  const body = div({}, [
    div({ class: 'summary' }, [
      stat({ label: 'Owed to you', value: format.money(owed), tone: owed > 0 ? 'debt' : null }),
      stat({ label: 'Paid ahead', value: format.money(credit), tone: credit > 0 ? 'paid' : null }),
    ]),
    people.length > 6 ? search.node : null,
    rows,
  ]);

  return {
    title: 'Customers',
    subtitle: `${people.length} ${people.length === 1 ? 'customer' : 'customers'}`,
    actions: [{ label: 'New customer', icon: 'userPlus', onClick: addCustomer }],
    body,
  };
}

/** Biggest debt first; settled and credit accounts after, alphabetically. */
function byDebtThenName(a, b) {
  if (a.balance > 0 && b.balance <= 0) return -1;
  if (b.balance > 0 && a.balance <= 0) return 1;
  if (a.balance !== b.balance && a.balance > 0) return b.balance - a.balance;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}
