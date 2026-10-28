import { div, button, input, span } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openSheet, confirmSheet } from '../core/sheet.js';
import { toastOk } from '../core/toast.js';
import { dataTable, statusDot, by } from '../widgets/table.js';
import { openAddStockSheet, openEditProductSheet, openNewProductSheet } from '../widgets/forms.js';
import { emptyState, stat, badge } from '../widgets/states.js';

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

const HISTORY_PAGE = 25;

/** Everything you can do to one product, and everything that has happened to it. */
async function openProductSheet(product, ctx) {
  const { api, format, reload } = ctx;

  const page = (offset) =>
    api.get(`/stock/products/${product.id}/movements?limit=${HISTORY_PAGE}&offset=${offset}`);

  const first = await page(0);
  let rows = first.entries.slice();
  let hasMore = first.hasMore;
  let loading = false;
  let closeSheet = () => {};

  const countLine = div({ class: 'picker__count' });

  const describe = () => {
    countLine.textContent =
      first.total === 0
        ? ''
        : hasMore
          ? `${rows.length} of ${first.total} · scroll for more`
          : `${first.total} ${first.total === 1 ? 'movement' : 'movements'}`;
  };

  const removeDelivery = async (movement) => {
    const confirmed = await confirmSheet({
      title: 'Remove this delivery?',
      message: `${format.quantity(movement.quantity)} ${product.unit ?? ''} will be taken back off ${product.name}.`
        .replace('  ', ' '),
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;

    await api.delete(`/stock/entries/${movement.id}`);
    closeSheet(null);
    toastOk('Delivery removed');
    await reload();
  };

  /*
   * Deleting a sale reaches further than the row it is on: the whole sale goes,
   * including any other product on it, and the customer's balance drops by the
   * full total. Both consequences are spelled out, because neither is visible
   * from here.
   */
  const removeSale = async (movement) => {
    const alsoOnThisSale = movement.saleItemCount - 1;

    const consequences = [
      `${format.quantity(movement.quantity)} ${product.unit ?? ''} goes back into stock.`.replace('  ', ' '),
      alsoOnThisSale > 0
        ? `This sale also covered ${alsoOnThisSale} other ${alsoOnThisSale === 1 ? 'product' : 'products'}, and all of it is removed.`
        : null,
      `${movement.who} will owe ${format.money(movement.saleTotal)} less.`,
    ].filter(Boolean);

    const confirmed = await confirmSheet({
      title: 'Delete this sale?',
      message: consequences.join(' '),
      confirmLabel: 'Delete the sale',
    });
    if (!confirmed) return;

    await api.delete(`/sales/${movement.id}`);
    closeSheet(null);
    toastOk(`Sale deleted — ${movement.who} owes ${format.money(movement.saleTotal)} less`);
    await reload();
  };

  /*
   * In and out on one timeline. Stock only means anything as the difference
   * between the two, so a list of deliveries alone invites "sold to whom?" and
   * then cannot answer it.
   *
   * Paged, and scrolling to the end is what asks for the next page rather than
   * a button to press. The count says what is still behind the scroll, because
   * a list that just stops looks the same as one that has ended.
   */
  const table = dataTable({
    rows,
    empty: 'Nothing has moved yet.',
    columns: [
      { key: 'at', label: 'When', cell: (movement) => format.relativeDay(movement.at) },
      {
        key: 'kind',
        label: 'Movement',
        cell: (movement) =>
          badge(movement.kind === 'in' ? 'Taken in' : 'Sold', movement.kind === 'in' ? 'paid' : 'quiet'),
      },
      {
        key: 'quantity',
        label: 'Qty',
        numeric: true,
        strong: true,
        cell: (movement) =>
          span({
            class: movement.kind === 'in' ? 'money--paid' : '',
            text: `${movement.kind === 'in' ? '+' : '−'}${format.quantity(movement.quantity)}`,
          }),
      },
      {
        key: 'who',
        label: 'Customer / note',
        cell: (movement) => movement.who || span({ class: 'table__sub', text: movement.note || '—' }),
      },
      {
        key: 'value',
        label: 'Value',
        numeric: true,
        cell: (movement) =>
          movement.kind === 'sold' ? format.money(movement.lineTotal) : span({ class: 'table__sub', text: '—' }),
      },
      {
        key: 'remove',
        label: '',
        width: '1%',
        cell: (movement) =>
          movement.kind === 'in'
            ? button(
                { class: 'icon-button', ariaLabel: 'Remove this delivery', onclick: () => removeDelivery(movement) },
                icon('trash', { size: 16 })
              )
            : button(
                {
                  class: 'icon-button',
                  ariaLabel: `Delete the sale to ${movement.who}`,
                  onclick: () => removeSale(movement),
                },
                icon('trash', { size: 16 })
              ),
      },
    ],
  });

  const loadMore = async () => {
    if (loading || !hasMore) return;
    loading = true;
    try {
      const next = await page(rows.length);
      rows = [...rows, ...next.entries];
      hasMore = next.hasMore;

      // Re-rendering replaces the body, so put the reader back where they were.
      const keep = table.node.scrollTop;
      table.setRows(rows);
      table.node.scrollTop = keep;

      describe();
    } finally {
      loading = false;
    }
  };

  table.node.addEventListener('scroll', () => {
    if (table.node.scrollTop + table.node.clientHeight >= table.node.scrollHeight - 64) loadMore();
  });

  /*
   * On a tall window the first page may not fill the area, leaving nothing to
   * scroll and so no way to ask for the rest. Keep pulling until it overflows
   * or runs out; the guard is there because a page that came back empty would
   * otherwise loop.
   */
  const fillList = async () => {
    for (let guard = 0; guard < 20; guard += 1) {
      if (!hasMore || table.node.scrollHeight > table.node.clientHeight + 4) return;
      const before = rows.length;
      await loadMore();
      if (rows.length === before) return;
    }
  };

  describe();

  const action = (label, iconName, extraClass, run) =>
    button({ class: `button ${extraClass}`.trim(), onclick: run }, [icon(iconName, { size: 16 }), label]);

  await openSheet({
    title: product.name,
    wide: true,
    hideConfirm: true,
    body: (close) => {
      closeSheet = close;

      // After layout, so clientHeight is real.
      setTimeout(fillList, 0);

      return div({ class: 'sheet-fill' }, [
        div({ class: 'summary', style: { gridTemplateColumns: 'repeat(3, 1fr)' } }, [
          stat({ label: 'In stock', value: `${format.quantity(product.onHand)} ${product.unit ?? ''}`.trim() }),
          stat({ label: 'Usual price', value: format.money(product.price) }),
          stat({ label: 'Sold', value: format.quantity(product.sold) }),
        ]),

        // One row rather than three stacked blocks: these are occasional
        // actions, and the history below them is what the sheet is for.
        div({ class: 'sheet-actions' }, [
          action('Add stock', 'stock', 'button--primary', async () => {
            close(null);
            const entry = await openAddStockSheet({ api, product, format, onHand: product.onHand });
            if (entry) {
              toastOk(`${format.quantity(entry.quantity)} added to ${product.name}`);
              await reload();
            }
          }),
          action('Edit', 'edit', '', async () => {
            close(null);
            if (await openEditProductSheet({ api, product, format })) {
              toastOk('Product updated');
              await reload();
            }
          }),
          action('Hide', 'trash', 'button--danger', async () => {
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
          }),
        ]),

        div({ class: 'section__head' }, [div({ class: 'section__title', text: 'History' }), countLine]),
        div({ class: 'history-pane' }, table.node),
      ]);
    },
  });
}
