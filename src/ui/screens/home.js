import { div, button, append } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { currentTheme, toggleTheme } from '../core/theme.js';
import { stat, badge } from '../widgets/states.js';

/**
 * Home.
 *
 * Three things the shopkeeper does — sell, take in stock, take money — and two
 * things they look up: who owes what, and what is on the shelves. Each is one
 * tap from here, as a target far too big to miss. The numbers above them answer
 * "how did today go" without anyone having to open a report.
 */
export async function home(ctx) {
  const { api, format, go, settings } = ctx;
  const overview = await api.get('/overview');

  const actions = [
    {
      label: 'Sell',
      hint: 'Record what a customer took',
      iconName: 'sell',
      primary: true,
      screen: 'sell',
    },
    {
      label: 'Add stock',
      hint: 'A delivery came in',
      iconName: 'stock',
      screen: 'stock-in',
    },
    {
      label: 'Take payment',
      hint: 'A customer paid you',
      iconName: 'money',
      screen: 'payment',
    },
  ];

  const tiles = div(
    { class: 'tiles' },
    actions.map((action) =>
      button({ class: `tile${action.primary ? ' tile--primary' : ''}`, onclick: () => go(action.screen) }, [
        div({ class: 'tile__icon' }, icon(action.iconName, { size: 26 })),
        div({ class: 'tile__label', text: action.label }),
        div({ class: 'tile__hint', text: action.hint }),
      ])
    )
  );

  const lookups = div({ class: 'tiles' }, [
    button({ class: 'tile', onclick: () => go('customers') }, [
      div({ class: 'tile__icon' }, icon('people', { size: 26 })),
      div({ class: 'tile__label', text: 'Customers' }),
      div({
        class: 'tile__hint',
        text: overview.counts.customers
          ? `${overview.counts.customers} ${plural(overview.counts.customers, 'customer')} · who owes what`
          : 'Add your first customer',
      }),
    ]),
    button({ class: 'tile', onclick: () => go('stock') }, [
      div({ class: 'tile__icon' }, icon('layers', { size: 26 })),
      div({ class: 'tile__label', text: 'Stock' }),
      div({
        class: 'tile__hint',
        text: overview.counts.products
          ? `${overview.counts.products} ${plural(overview.counts.products, 'product')} · what is left`
          : 'Add your first product',
      }),
    ]),
    button({ class: 'tile', onclick: () => go('reports', { preset: 'month' }) }, [
      div({ class: 'tile__icon' }, icon('receipt', { size: 26 })),
      div({ class: 'tile__label', text: 'Sales report' }),
      div({ class: 'tile__hint', text: 'What sold, over any period' }),
    ]),
  ]);

  const summary = div({ class: 'summary' }, [
    stat({
      label: 'Sold today',
      value: format.money(overview.today.salesTotal),
      hint: `${overview.today.salesCount} ${plural(overview.today.salesCount, 'sale')}`,
    }),
    stat({
      label: 'Paid to you today',
      value: format.money(overview.today.paymentsTotal),
      hint: `${overview.today.paymentsCount} ${plural(overview.today.paymentsCount, 'payment')}`,
      tone: overview.today.paymentsTotal > 0 ? 'paid' : null,
    }),
    stat({
      label: 'Owed to you',
      value: format.money(overview.ledger.receivable),
      hint: overview.ledger.credit > 0 ? `${format.money(overview.ledger.credit)} paid ahead` : 'across all customers',
      tone: overview.ledger.receivable > 0 ? 'debt' : null,
    }),
    stat({
      label: 'Sold this month',
      value: format.money(overview.month.salesTotal),
      hint: `${overview.month.salesCount} ${plural(overview.month.salesCount, 'sale')}`,
    }),
  ]);

  const body = div({}, [summary, tiles, lookups, lowStockSection(overview, ctx)]);

  return {
    title: settings.shopName || 'ShopWise',
    subtitle: new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
    actions: [
      {
        label: currentTheme() === 'dark' ? 'Light mode' : 'Dark mode',
        icon: currentTheme() === 'dark' ? 'sun' : 'moon',
        onClick: () => {
          toggleTheme();
          ctx.reload();
        },
      },
      { label: 'Settings', icon: 'settings', onClick: () => go('settings') },
    ],
    body,
  };
}

/** Only appears when something is actually running out. */
function lowStockSection(overview, { go, format }) {
  if (!overview.lowStock.length) return null;

  const rows = div(
    { class: 'rows' },
    overview.lowStock.map((product) =>
      button({ class: 'row', onclick: () => go('stock') }, [
        div({ class: 'row__main' }, div({ class: 'row__title', text: product.name })),
        badge(
          product.onHand <= 0
            ? 'none left'
            : `${format.quantity(product.onHand)} ${product.unit ?? ''} left`.trim(),
          product.onHand <= 0 ? 'debt' : 'warn'
        ),
      ])
    )
  );

  const section = div({ class: 'section' });
  append(section, [
    div({ class: 'section__head' }, div({ class: 'section__title', text: 'Running low' })),
    rows,
  ]);
  return section;
}

const plural = (count, word) => (count === 1 ? word : `${word}s`);
