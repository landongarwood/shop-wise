import { div, button, input, span } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toastOk } from '../core/toast.js';
import { dataTable, statusDot, by } from '../widgets/table.js';
import { openNewCustomerSheet } from '../widgets/forms.js';
import { emptyState, stat } from '../widgets/states.js';

/**
 * Who owes what.
 *
 * Sorted by debt, largest first, because the reason to open this screen is
 * almost always to see who has not paid. Beside it is when each person was last
 * in, so a debt that is still being paid down reads differently from one nobody
 * has seen for a month. Running totals belong to one customer at a time and
 * live on their own screen. Every column sorts.
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

  const owed = people.reduce((sum, person) => sum + Math.max(0, person.balance), 0);
  const credit = people.reduce((sum, person) => sum + Math.max(0, -person.balance), 0);
  const owingCount = people.filter((person) => person.balance > 0).length;

  const summary = div({ class: 'summary' }, [
    stat({
      label: 'Owed to you',
      value: format.money(owed),
      hint: `${owingCount} ${owingCount === 1 ? 'customer owes' : 'customers owe'} you`,
      tone: owed > 0 ? 'debt' : null,
    }),
    stat({ label: 'Paid ahead', value: format.money(credit), tone: credit > 0 ? 'paid' : null }),
    stat({ label: 'Customers', value: String(people.length) }),
  ]);

  /* ---------- filtering ---------- */

  let term = '';
  let filter = 'all';

  const FILTERS = [
    { key: 'all', label: 'All', count: people.length, test: () => true },
    { key: 'owing', label: 'Owing', count: owingCount, test: (person) => person.balance > 0 },
    {
      key: 'settled',
      label: 'Settled',
      count: people.filter((person) => person.balance <= 0).length,
      test: (person) => person.balance <= 0,
    },
  ];

  const visible = () =>
    people
      .filter(FILTERS.find((candidate) => candidate.key === filter).test)
      .filter((person) => person.name.toLowerCase().includes(term));

  const search = input({
    class: 'input input--search',
    type: 'search',
    placeholder: 'Search customers',
    ariaLabel: 'Search customers',
    autocomplete: 'off',
    oninput: () => {
      term = search.value.trim().toLowerCase();
      refresh();
    },
  });

  const chips = div({ class: 'chips' });
  const countLine = div({ class: 'picker__count' });

  const drawChips = () => {
    chips.replaceChildren(
      ...FILTERS.map((option) =>
        button(
          {
            class: `chip${filter === option.key ? ' chip--active' : ''}`,
            onclick: () => {
              filter = option.key;
              drawChips();
              refresh();
            },
          },
          [option.label, span({ class: 'chip__count', text: String(option.count) })]
        )
      )
    );
  };

  function refresh() {
    const rows = visible();
    table.setRows(rows);
    countLine.textContent =
      rows.length === people.length
        ? `${people.length} ${people.length === 1 ? 'customer' : 'customers'}`
        : `${rows.length} of ${people.length} customers`;
  }

  /* ---------- the table ---------- */

  const table = dataTable({
    rows: people,
    initialSort: { key: 'balance', direction: 'desc' },
    onRowClick: (person) => go('customer', { id: person.id }),
    empty: 'Nothing matches that.',
    columns: [
      {
        key: 'status',
        label: '',
        width: '1%',
        cell: (person) =>
          person.balance > 0
            ? statusDot('out', 'Owes you')
            : person.balance < 0
              ? statusDot('ok', 'Paid ahead')
              : statusDot('neutral', 'Settled up'),
      },
      {
        key: 'name',
        label: 'Customer',
        sort: by.text((person) => person.name),
        cell: (person) => person.name,
      },
      {
        key: 'lastVisit',
        label: 'Last visited',
        title: 'Sort by last visited',
        // Buying and paying both count as a visit. Someone who has not been in
        // for weeks is the one worth chasing, which is why this sits here
        // instead of the running totals — those are on their own screen.
        sort: by.text((person) => person.lastVisit ?? ''),
        cell: (person) =>
          person.lastVisit
            ? format.relativeDay(person.lastVisit)
            : span({ class: 'soft', text: 'not yet' }),
      },
      {
        key: 'balance',
        label: 'Balance',
        numeric: true,
        strong: true,
        sort: by.number((person) => person.balance),
        cell: (person) =>
          span({
            class: person.balance > 0 ? 'money--debt' : person.balance < 0 ? 'money--paid' : 'soft',
            text: person.balance === 0 ? '—' : format.money(Math.abs(person.balance)),
          }),
      },
      {
        key: 'state',
        label: '',
        cell: (person) =>
          span({
            class: 'table__sub',
            text: person.balance > 0 ? 'owes' : person.balance < 0 ? 'in credit' : 'settled',
          }),
      },
      {
        key: 'pay',
        label: '',
        width: '1%',
        // Always offered. A customer who owes nothing can still hand over money
        // — that is what paying ahead is — so hiding this would make a normal
        // thing look impossible.
        cell: (person) =>
          button(
            {
              class: 'table__action',
              title: `Record a payment from ${person.name}`,
              onclick: () => go('payment', { customer: person }),
            },
            ['Take payment']
          ),
      },
    ],
  });

  drawChips();
  refresh();

  const toolbar = div({ class: 'toolbar' }, [
    div({ class: 'toolbar__search' }, search),
    chips,
    button({ class: 'button', onclick: addCustomer }, [icon('userPlus', { size: 18 }), 'New customer']),
  ]);

  return {
    title: 'Customers',
    subtitle: `${people.length} ${people.length === 1 ? 'customer' : 'customers'} · tap a row for history`,
    body: div({}, [summary, toolbar, countLine, table.node]),
  };
}
