import { div, button, input, span, append } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openSheet, confirmSheet } from '../core/sheet.js';
import { toastOk } from '../core/toast.js';
import { dataTable, statusDot, by } from '../widgets/table.js';
import { openAddStockSheet, openEditProductSheet, openNewProductSheet } from '../widgets/forms.js';
import { emptyState, stat } from '../widgets/states.js';

/**
 * Stock: what is on the shelves, and the place stock is taken in.
 *
 * There is no separate "add stock" screen. A delivery changes a number that
 * lives here, so it is entered here — one tap on the row's Add button, a
 * quantity, done, without losing your place in the list.
 *
 * The table is built for a catalogue of hundreds: search, filters for what is
 * low or out, every column sortable, and a status dot so a shortage is visible
 * before anything is read.
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

  /* ---------- taking stock in ---------- */

  const addStock = async (product) => {
    const entry = await openAddStockSheet({ api, product, format, onHand: product.onHand });
    if (!entry) return;

    toastOk(`${format.quantity(entry.quantity)} ${product.unit ?? ''} of ${product.name} added`.replace('  ', ' '));
    await reload();
  };

  /* ---------- figures ---------- */

  const lowCount = products.filter((product) => product.low && product.onHand > 0).length;
  const outCount = products.filter((product) => product.onHand <= 0).length;
  const stockValue = products.reduce(
    (sum, product) => sum + Math.round(product.price * Math.max(0, product.onHand)),
    0
  );

  const summary = div({ class: 'summary' }, [
    stat({ label: 'Products', value: String(products.length) }),
    stat({
      label: 'Running low',
      value: String(lowCount),
      hint: 'at or below your low-stock level',
      tone: lowCount ? 'warn' : null,
    }),
    stat({ label: 'Out of stock', value: String(outCount), tone: outCount ? 'debt' : null }),
    stat({ label: 'Stock value', value: format.money(stockValue), hint: 'at your usual prices' }),
  ]);

  /* ---------- filtering ---------- */

  let term = '';
  let filter = 'all';

  const FILTERS = [
    { key: 'all', label: 'All', count: products.length, test: () => true },
    { key: 'low', label: 'Low', count: lowCount, test: (product) => product.low && product.onHand > 0 },
    { key: 'out', label: 'Out', count: outCount, test: (product) => product.onHand <= 0 },
  ];

  const visible = () =>
    products
      .filter(FILTERS.find((candidate) => candidate.key === filter).test)
      .filter((product) => product.name.toLowerCase().includes(term));

  const search = input({
    class: 'input input--search',
    type: 'search',
    placeholder: 'Search products',
    ariaLabel: 'Search products',
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
      rows.length === products.length
        ? `${products.length} ${products.length === 1 ? 'product' : 'products'}`
        : `${rows.length} of ${products.length} products`;
  }

  /* ---------- the table ---------- */

  const table = dataTable({
    rows: products,
    initialSort: { key: 'name', direction: 'asc' },
    onRowClick: (product) => openProductSheet(product, ctx),
    empty: 'No product matches that.',
    columns: [
      {
        key: 'status',
        label: '',
        // 1% with nowrap is the shrink-to-fit idiom for an auto-layout table.
        width: '1%',
        cell: (product) =>
          product.onHand <= 0
            ? statusDot('out', 'Out of stock')
            : product.low
              ? statusDot('low', 'Running low')
              : statusDot('ok', 'In stock'),
      },
      {
        key: 'name',
        label: 'Product',
        sort: by.text((product) => product.name),
        cell: (product) => product.name,
      },
      {
        key: 'unit',
        label: 'Unit',
        sort: by.text((product) => product.unit),
        cell: (product) => span({ class: 'table__sub', text: product.unit || '—' }),
      },
      {
        key: 'price',
        label: 'Price',
        numeric: true,
        sort: by.number((product) => product.price),
        cell: (product) => format.money(product.price),
      },
      {
        key: 'added',
        label: 'Taken in',
        numeric: true,
        sort: by.number((product) => product.added),
        cell: (product) => format.quantity(product.added),
      },
      {
        key: 'sold',
        label: 'Sold',
        numeric: true,
        sort: by.number((product) => product.sold),
        cell: (product) => format.quantity(product.sold),
      },
      {
        key: 'onHand',
        label: 'In stock',
        numeric: true,
        strong: true,
        sort: by.number((product) => product.onHand),
        cell: (product) =>
          span({
            class: product.onHand <= 0 ? 'money--debt' : product.low ? 'picker__low' : '',
            text: format.quantity(product.onHand),
          }),
      },
      {
        key: 'value',
        label: 'Value',
        numeric: true,
        sort: by.number((product) => product.price * Math.max(0, product.onHand)),
        cell: (product) => format.money(Math.round(product.price * Math.max(0, product.onHand))),
      },
      {
        key: 'add',
        label: '',
        width: '1%',
        cell: (product) =>
          button({ class: 'table__action', title: `Add stock to ${product.name}`, onclick: () => addStock(product) }, [
            '+ Add',
          ]),
      },
    ],
  });

  drawChips();
  refresh();

  const toolbar = div({ class: 'toolbar' }, [
    div({ class: 'toolbar__search' }, search),
    chips,
    button({ class: 'button', onclick: addNewProduct }, [icon('plus', { size: 18 }), 'New product']),
  ]);

  const body = div({}, [summary, toolbar, countLine, table.node]);

  return {
    title: 'Stock',
    subtitle: `${products.length} ${products.length === 1 ? 'product' : 'products'} · tap a row for details`,
    body,
  };
}

const HISTORY_PAGE = 20;

/** The handful of things you can do to one product. */
async function openProductSheet(product, ctx) {
  const { api, format, reload } = ctx;

  const page = (offset) => api.get(`/stock/products/${product.id}/entries?limit=${HISTORY_PAGE}&offset=${offset}`);

  const first = await page(0);
  let shown = first.entries.length;
  let hasMore = first.hasMore;

  /*
   * A product restocked weekly for two years has a hundred entries behind it,
   * so the history is paged and scrolls in its own area. The count says how
   * much is behind the scroll, because a list that just stops is indis-
   * tinguishable from one that has ended.
   */
  const list = div({ class: 'history' });
  const countLine = div({ class: 'picker__count' });
  const olderButton = button({ class: 'button button--block' }, 'Show older');

  let closeSheet = () => {};

  const describe = () => {
    countLine.textContent =
      first.total === 0
        ? ''
        : hasMore
          ? `showing ${shown} of ${first.total}`
          : `${first.total} ${first.total === 1 ? 'entry' : 'entries'}`;
    olderButton.hidden = !hasMore;
  };

  const entryRow = (entry) =>
    div({ class: 'row row--static' }, [
      div({ class: 'row__main' }, [
        div({
          class: 'row__title tnum',
          text: `+ ${format.quantity(entry.quantity)} ${product.unit ?? ''}`.trim(),
        }),
        div({
          class: 'row__sub',
          text: `${format.relativeDay(entry.at)}${entry.note ? ` · ${entry.note}` : ''}`,
        }),
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
              closeSheet(null);
              toastOk('Entry removed');
              await reload();
            }
          },
        },
        icon('trash', { size: 18 })
      ),
    ]);

  olderButton.addEventListener('click', async () => {
    olderButton.disabled = true;
    try {
      const next = await page(shown);
      append(list, next.entries.map(entryRow));
      shown += next.entries.length;
      hasMore = next.hasMore;
      describe();
    } finally {
      olderButton.disabled = false;
    }
  });

  append(list, first.entries.map(entryRow));
  describe();

  await openSheet({
    title: product.name,
    hideConfirm: true,
    cancelLabel: 'Close',
    body: (close) => {
      closeSheet = close;

      return div({ class: 'sheet-fill' }, [
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

        div({ class: 'section__head' }, [
          div({ class: 'section__title', text: 'Stock taken in' }),
          countLine,
        ]),
        first.total
          ? div({ class: 'history-pane' }, [list, olderButton])
          : div({ class: 'card soft', text: 'No stock has been taken in yet.' }),
      ]);
    },
  });
}

