import { div, button, append } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { currentTheme, toggleTheme } from '../core/theme.js';
import { badge } from '../widgets/states.js';

/**
 * Home.
 *
 * Three things the shopkeeper does — sell, take in stock, take money — and the
 * things they look up. Each is one tap from here, as a target far too big to
 * miss.
 *
 * Deliberately no figures at the top: this screen is for getting on with the
 * job. The takings live on the sales report and the debts on the customer list,
 * which is where someone goes when they actually want to read a number. The one
 * exception is stock running out, which has to interrupt rather than wait to be
 * asked for.
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
          ? `${overview.counts.products} ${plural(overview.counts.products, 'product')} · check and top up`
          : 'Add your first product',
      }),
    ]),
    button({ class: 'tile', onclick: () => go('reports', { preset: 'today' }) }, [
      div({ class: 'tile__icon' }, icon('receipt', { size: 26 })),
      div({ class: 'tile__label', text: 'Sales report' }),
      div({ class: 'tile__hint', text: "Today's lines, or any period" }),
    ]),
  ]);

  const body = div({}, [tiles, lookups, lowStockSection(overview, ctx)]);

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
