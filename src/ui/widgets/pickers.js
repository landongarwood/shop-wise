import { div, button, input, append, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openSheet } from '../core/sheet.js';
import { openNewCustomerSheet, openNewProductSheet } from './forms.js';
import { badge } from './states.js';

/**
 * Choosing a thing from a list.
 *
 * A shop can easily carry hundreds of products, so these are lists with a
 * search box rather than grids of tiles: typing two or three letters beats
 * hunting through pages of boxes, and a list stays readable at any length.
 * The "new one" button sits inside the picker, because needing something that
 * is not in the list yet is exactly when you discover it is missing.
 */

function searchBox({ placeholder, onChange, label = placeholder }) {
  const control = input({
    class: 'input input--search',
    type: 'search',
    placeholder,
    ariaLabel: label,
    autocomplete: 'off',
    oninput: () => onChange(control.value.trim().toLowerCase()),
  });

  return { node: div({ style: { marginBottom: 'var(--space-3)' } }, control), control };
}

const matches = (haystack, term) => !term || haystack.toLowerCase().includes(term);

/**
 * The product list used on the sell and stock-in screens.
 *
 * Search filters as you type and Enter takes the top match, so a sale can be
 * entered from the keyboard without the hand leaving it. The rows scroll within
 * their own area rather than pushing the running total off the screen.
 *
 * A row can be marked unavailable — selling something with no stock recorded
 * is a mistake rather than a choice — in which case tapping it calls
 * `onUnavailable` instead, which is where the way out is offered.
 *
 * @returns {{node: HTMLElement, focusSearch: Function}}
 */
export function productList({
  products,
  format,
  onPick,
  onNew = null,
  newLabel = 'New product',
  unavailable = null,
  onUnavailable = null,
}) {
  const rows = div({ class: 'rows picker__rows' });
  const count = div({ class: 'picker__count' });

  let visible = [];

  const draw = (term = '') => {
    clear(rows);
    visible = products.filter((product) => matches(product.name, term));

    count.textContent = term
      ? `${visible.length} of ${products.length} ${products.length === 1 ? 'product' : 'products'}`
      : `${products.length} ${products.length === 1 ? 'product' : 'products'}`;

    if (!visible.length) {
      append(rows, div({ class: 'row row--static' }, div({ class: 'soft', text: 'No product matches that.' })));
      return;
    }

    append(
      rows,
      visible.map((product) => {
        const blocked = Boolean(unavailable?.(product));
        return productRow(product, format, blocked ? onUnavailable ?? onPick : onPick, blocked);
      })
    );
  };

  const search = searchBox({
    placeholder: 'Search products — type to filter',
    label: 'Search products',
    onChange: draw,
  });

  // Enter takes the top match, so the keyboard alone is enough.
  search.control.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !visible.length) return;
    event.preventDefault();

    const top = visible[0];
    if (unavailable?.(top)) onUnavailable?.(top);
    else onPick(top);
  });

  draw();

  const node = div({ class: 'picker' }, [
    div({ class: 'picker__head' }, [
      div({ class: 'grow' }, search.node),
      onNew ? button({ class: 'button', onclick: onNew }, [icon('plus', { size: 18 }), newLabel]) : null,
    ]),
    count,
    rows,
  ]);

  return {
    node,
    focusSearch: () => search.control.focus(),
  };
}

function productRow(product, format, onPick, blocked = false) {
  const out = product.onHand <= 0;
  const low = !out && product.low;

  return button({ class: `row${blocked ? ' row--blocked' : ''}`, onclick: () => onPick(product) }, [
    div({ class: 'row__main' }, [
      div({ class: 'row__title', text: product.name }),
      div({
        class: `row__sub tnum${out ? ' money--debt' : low ? ' picker__low' : ''}`,
        text: out
          ? 'none in stock'
          : `${format.quantity(product.onHand)} ${product.unit ?? ''} in stock`.replace('  ', ' ').trim(),
      }),
    ]),
    div({ class: 'row__end' }, div({ class: 'row__amount tnum', text: format.money(product.price) })),
  ]);
}

/**
 * A searchable list inside a sheet. Tapping a row closes the sheet with that
 * row's item; the sheet has no confirm button because the choice *is* the tap.
 */
function openListPicker({ title, items, placeholder, renderRow, searchOn, newLabel = null, onNew = null, emptyTitle }) {
  return openSheet({
    title,
    wide: true,
    hideConfirm: true,
    cancelLabel: 'Close',
    body: (close) => {
      const rows = div({ class: 'rows picker__rows' });
      let visible = [];

      const draw = (term = '') => {
        clear(rows);
        visible = items.filter((item) => matches(searchOn(item), term));

        if (!visible.length) {
          append(
            rows,
            div({ class: 'row row--static' }, div({ class: 'soft', text: term ? 'Nothing matches that.' : emptyTitle }))
          );
          return;
        }

        append(
          rows,
          visible.map((item) => button({ class: 'row', onclick: () => close(item) }, renderRow(item)))
        );
      };

      const search = searchBox({ placeholder, onChange: draw });
      search.control.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || !visible.length) return;
        event.preventDefault();
        close(visible[0]);
      });

      draw();

      return div({}, [
        items.length > 6 ? search.node : null,
        rows,
        onNew
          ? button(
              {
                class: 'button button--block',
                style: { marginTop: 'var(--space-3)' },
                onclick: async () => {
                  const created = await onNew();
                  if (created) close(created);
                },
              },
              [icon('plus', { size: 18 }), newLabel]
            )
          : null,
      ]);
    },
  });
}

/** Pick a customer, with what they currently owe shown on every row. */
export async function openCustomerPicker({ api, format, title = 'Which customer?' }) {
  const customers = await api.get('/customers');

  return openListPicker({
    title,
    items: customers,
    placeholder: 'Search customers',
    searchOn: (customer) => customer.name,
    emptyTitle: 'No customers yet.',
    newLabel: 'New customer',
    onNew: () => openNewCustomerSheet({ api }),
    renderRow: (customer) => {
      const position = format.balance(customer.balance);
      return [
        div({ class: 'row__main' }, div({ class: 'row__title', text: customer.name })),
        badge(position.text, position.tone),
      ];
    },
  });
}

