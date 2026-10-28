import { div, button, append, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openSheet, confirmSheet } from '../core/sheet.js';
import { toastOk } from '../core/toast.js';
import { searchBox } from '../widgets/pickers.js';
import { openAddStockSheet, openEditProductSheet, openNewProductSheet } from '../widgets/forms.js';
import { badge, emptyState, stat } from '../widgets/states.js';

/**
 * What is on the shelves.
 *
 * Anything short appears at the top, because that is the reason to open this
 * screen. Tapping a product opens the few things one can do with it rather than
 * hiding them behind menus.
 */
export async function stock(ctx) {
  const { api, format, reload } = ctx;

  const products = await api.get('/stock');

  const addNewProduct = async () => {
    const created = await openNewProductSheet({ api });
    if (created) {
      toastOk(`${created.name} added`);
      await reload();
    }
  };

  if (!products.length) {
    return {
      title: 'Stock',
      body: emptyState({
        title: 'No products yet',
        message: 'Add what you sell and how much you have.',
        actionLabel: 'Add a product',
        onAction: addNewProduct,
      }),
    };
  }

  const sorted = products.slice().sort(byShortageThenName);
  const stockValue = products.reduce((sum, product) => sum + Math.round(product.price * Math.max(0, product.onHand)), 0);
  const lowCount = products.filter((product) => product.low).length;

  const rows = div({ class: 'rows' });

  const draw = (term = '') => {
    clear(rows);

    const matches = term ? sorted.filter((product) => product.name.toLowerCase().includes(term)) : sorted;

    if (!matches.length) {
      append(rows, div({ class: 'row row--static' }, div({ class: 'soft', text: 'Nothing matches that.' })));
      return;
    }

    append(
      rows,
      matches.map((product) =>
        button({ class: 'row', onclick: () => openProductSheet(product, ctx) }, [
          div({ class: 'row__main' }, [
            div({ class: 'row__title', text: product.name }),
            div({
              class: 'row__sub tnum',
              text: `${format.money(product.price)} per ${product.unit || 'item'} · ${format.quantity(
                product.sold
              )} sold`,
            }),
          ]),
          product.onHand <= 0
            ? badge('none left', 'debt')
            : product.low
              ? badge(`${format.quantity(product.onHand)} ${product.unit ?? ''} left`.trim(), 'warn')
              : div({ class: 'row__end' }, [
                  div({ class: 'row__amount tnum', text: format.quantity(product.onHand) }),
                  div({ class: 'faint', text: product.unit || 'in stock' }),
                ]),
        ])
      )
    );
  };

  const search = searchBox({ placeholder: 'Search products', onChange: draw });
  draw();

  const body = div({}, [
    div({ class: 'summary' }, [
      stat({ label: 'Products', value: String(products.length) }),
      stat({
        label: 'Running low',
        value: String(lowCount),
        hint: lowCount ? 'at or below your low-stock level' : 'nothing to restock',
        tone: lowCount ? 'debt' : null,
      }),
      stat({ label: 'Stock value', value: format.money(stockValue), hint: 'at your usual prices' }),
    ]),
    products.length > 6 ? search.node : null,
    rows,
  ]);

  return {
    title: 'Stock',
    subtitle: `${products.length} ${products.length === 1 ? 'product' : 'products'}`,
    actions: [{ label: 'New product', icon: 'plus', onClick: addNewProduct }],
    body,
  };
}

/** The handful of things you can do to one product. */
async function openProductSheet(product, ctx) {
  const { api, format, reload } = ctx;
  const entries = await api.get(`/stock/products/${product.id}/entries`);

  await openSheet({
    title: product.name,
    hideConfirm: true,
    cancelLabel: 'Close',
    body: (close) =>
      div({}, [
        div({ class: 'summary', style: { gridTemplateColumns: '1fr 1fr' } }, [
          stat({ label: 'In stock', value: `${format.quantity(product.onHand)} ${product.unit ?? ''}`.trim() }),
          stat({ label: 'Usual price', value: format.money(product.price) }),
        ]),

        div({ class: 'stack', style: { marginBottom: 'var(--space-5)' } }, [
          button(
            {
              class: 'button button--primary button--block',
              onclick: async () => {
                close(null);
                const entry = await openAddStockSheet({ api, product, format, onHand: product.onHand });
                if (entry) {
                  toastOk(`${format.quantity(entry.quantity)} added to ${product.name}`);
                  await reload();
                }
              },
            },
            [icon('stock', { size: 18 }), 'Add stock']
          ),
          button(
            {
              class: 'button button--block',
              onclick: async () => {
                close(null);
                if (await openEditProductSheet({ api, product, format })) {
                  toastOk('Product updated');
                  await reload();
                }
              },
            },
            [icon('edit', { size: 18 }), 'Edit name, unit or price']
          ),
          button(
            {
              class: 'button button--block button--danger',
              onclick: async () => {
                close(null);
                const confirmed = await confirmSheet({
                  title: `Hide ${product.name}?`,
                  message:
                    'It disappears from the sell and stock screens. Sales already recorded keep it, so your history stays correct.',
                  confirmLabel: 'Hide it',
                });
                if (confirmed) {
                  await api.delete(`/products/${product.id}`);
                  toastOk(`${product.name} hidden`);
                  await reload();
                }
              },
            },
            [icon('trash', { size: 18 }), 'Hide this product']
          ),
        ]),

        div({ class: 'section__title', text: 'Stock added' }),
        entries.length
          ? div(
              { class: 'rows' },
              entries.slice(0, 12).map((entry) =>
                div({ class: 'row row--static' }, [
                  div({ class: 'row__main' }, [
                    div({ class: 'row__title tnum', text: `+ ${format.quantity(entry.quantity)} ${product.unit ?? ''}`.trim() }),
                    div({ class: 'row__sub', text: `${format.relativeDay(entry.at)}${entry.note ? ` · ${entry.note}` : ''}` }),
                  ]),
                  button(
                    {
                      class: 'icon-button',
                      ariaLabel: 'Remove this entry',
                      onclick: async () => {
                        const confirmed = await confirmSheet({
                          title: 'Remove this stock entry?',
                          message: `${format.quantity(entry.quantity)} will be taken back off ${product.name}.`,
                          confirmLabel: 'Remove',
                        });
                        if (confirmed) {
                          await api.delete(`/stock/entries/${entry.id}`);
                          close(null);
                          toastOk('Entry removed');
                          await reload();
                        }
                      },
                    },
                    icon('trash', { size: 18 })
                  ),
                ])
              )
            )
          : div({ class: 'card soft', text: 'No stock has been added yet.' }),
      ]),
  });
}

/** Out of stock first, then low, then the rest alphabetically. */
function byShortageThenName(a, b) {
  const rank = (product) => (product.onHand <= 0 ? 0 : product.low ? 1 : 2);
  return rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}
