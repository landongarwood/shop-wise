import { div, button, input, append, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openSheet } from '../core/sheet.js';
import { openNewCustomerSheet } from './forms.js';
import { badge } from './states.js';

/**
 * Choosing a thing from a list.
 *
 * Search filters as you type but is never required: with a handful of products
 * or customers the list is simply all of them, as big tappable rows. The
 * "new one" button sits inside the picker, because needing something that is
 * not in the list yet is exactly when you discover it is missing.
 */

function searchBox({ placeholder, onChange }) {
  const control = input({
    class: 'input input--search',
    type: 'search',
    placeholder,
    autocomplete: 'off',
    oninput: () => onChange(control.value.trim().toLowerCase()),
  });

  return { node: div({ style: { marginBottom: 'var(--space-3)' } }, control), control };
}

/**
 * A searchable list inside a sheet. Tapping a row closes the sheet with that
 * row's item; the sheet has no confirm button because the choice *is* the tap.
 */
function openListPicker({ title, items, placeholder, renderRow, newLabel = null, onNew = null, emptyTitle }) {
  return openSheet({
    title,
    wide: true,
    hideConfirm: true,
    cancelLabel: 'Close',
    body: (close) => {
      const rows = div({ class: 'rows' });

      const draw = (term = '') => {
        clear(rows);

        const matches = term
          ? items.filter((item) => `${item.name} ${item.phone ?? ''}`.toLowerCase().includes(term))
          : items;

        if (!matches.length) {
          append(
            rows,
            div({ class: 'row row--static' }, div({ class: 'soft', text: term ? 'Nothing matches that.' : emptyTitle }))
          );
          return;
        }

        append(
          rows,
          matches.map((item) => button({ class: 'row', onclick: () => close(item) }, renderRow(item)))
        );
      };

      const search = searchBox({ placeholder, onChange: draw });
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
    emptyTitle: 'No customers yet.',
    newLabel: 'New customer',
    onNew: () => openNewCustomerSheet({ api }),
    renderRow: (customer) => {
      const position = format.balance(customer.balance);
      return [
        div({ class: 'row__main' }, [
          div({ class: 'row__title', text: customer.name }),
          customer.phone ? div({ class: 'row__sub', text: customer.phone }) : null,
        ]),
        badge(position.text, position.tone),
      ];
    },
  });
}

/** Pick a product from a sheet, used where a grid would not fit. */
export async function openProductPicker({ api, format, title = 'Which product?' }) {
  const products = await api.get('/stock');

  return openListPicker({
    title,
    items: products,
    placeholder: 'Search products',
    emptyTitle: 'No products yet.',
    newLabel: 'New product',
    onNew: () => import('./forms.js').then((module) => module.openNewProductSheet({ api })),
    renderRow: (product) => [
      div({ class: 'row__main' }, [
        div({ class: 'row__title', text: product.name }),
        div({ class: 'row__sub', text: `${format.quantity(product.onHand)} ${product.unit ?? ''} in stock`.trim() }),
      ]),
      div({ class: 'row__end' }, div({ class: 'row__amount tnum', text: format.money(product.price) })),
    ],
  });
}

/**
 * The product grid used on the sell and stock-in screens: everything visible at
 * once, one tap to act, no menus.
 */
export function productGrid({ products, format, onPick, onNew = null, newLabel = 'New product' }) {
  const grid = div({ class: 'pick-grid' });

  const tile = (product) => {
    const out = product.onHand <= 0;
    const low = !out && product.low;

    return button({ class: `pick${out ? ' pick--out' : low ? ' pick--low' : ''}`, onclick: () => onPick(product) }, [
      div({ class: 'pick__name', text: product.name }),
      div({ class: 'pick__price tnum', text: format.money(product.price) }),
      div({
        class: 'pick__stock tnum',
        text: out
          ? 'none in stock'
          : `${format.quantity(product.onHand)} ${product.unit ?? ''} in stock`.trim(),
      }),
    ]);
  };

  append(grid, products.map(tile));

  if (onNew) {
    append(
      grid,
      button(
        { class: 'pick', style: { justifyContent: 'center', alignItems: 'center', color: 'var(--accent)' }, onclick: onNew },
        [icon('plus', { size: 26 }), div({ class: 'pick__name', text: newLabel })]
      )
    );
  }

  return grid;
}

export { searchBox, openListPicker };
