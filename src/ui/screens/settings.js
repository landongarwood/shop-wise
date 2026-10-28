import { div, button, input, label, span, append } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { currentTheme, toggleTheme } from '../core/theme.js';
import { toastOk } from '../core/toast.js';

/**
 * Settings, and where the data lives.
 *
 * Four things worth changing and one thing worth knowing: the folder holding
 * the books, so the shopkeeper can copy it to a memory stick.
 */
export async function settings(ctx) {
  const { api, reload } = ctx;

  const meta = await api.get('/meta');
  const current = meta.settings;

  const shopName = input({ class: 'input', type: 'text', value: current.shopName ?? '', maxLength: 60 });
  const currency = input({ class: 'input', type: 'text', value: current.currency ?? '$', maxLength: 4 });
  const lowStockAt = input({
    class: 'input tnum',
    type: 'text',
    inputMode: 'numeric',
    value: String(current.lowStockAt ?? 5),
  });

  const problem = div({ class: 'field__hint', style: { color: 'var(--debt)' } });

  const save = button({ class: 'button button--primary button--block button--confirm' }, [
    icon('check', { size: 20 }),
    'Save settings',
  ]);

  save.addEventListener('click', async () => {
    problem.textContent = '';
    save.disabled = true;

    try {
      await api.patch('/settings', {
        shopName: shopName.value.trim() || 'My Shop',
        currency: currency.value.trim() || '$',
        lowStockAt: Number(lowStockAt.value.trim() || 0),
      });

      // Settings change how money is written everywhere, so the shared
      // formatter is rebuilt before anything redraws.
      await ctx.refreshSettings();
      toastOk('Settings saved');
      await reload();
    } catch (err) {
      problem.textContent = err.message;
      save.disabled = false;
    }
  });

  const body = div({}, [
    div({ class: 'section' }, [
      label({ class: 'field' }, [
        span({ class: 'field__label', text: 'Shop name' }),
        shopName,
        div({ class: 'field__hint', text: 'Shown at the top of the home screen.' }),
      ]),
      label({ class: 'field' }, [
        span({ class: 'field__label', text: 'Currency symbol' }),
        currency,
        div({ class: 'field__hint', text: `Amounts will read like ${currency.value || '$'}1,250.00` }),
      ]),
      label({ class: 'field' }, [
        span({ class: 'field__label', text: 'Warn me when stock falls to' }),
        lowStockAt,
        div({ class: 'field__hint', text: 'Products at or below this appear under "Running low".' }),
      ]),
      problem,
      save,
    ]),

    div({ class: 'section' }, [
      div({ class: 'section__head' }, div({ class: 'section__title', text: 'Appearance' })),
      button(
        {
          class: 'button button--block',
          onclick: () => {
            toggleTheme();
            reload();
          },
        },
        [
          icon(currentTheme() === 'dark' ? 'sun' : 'moon', { size: 18 }),
          currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        ]
      ),
    ]),

    aboutSection(meta),
  ]);

  return { title: 'Settings', body };
}

function aboutSection(meta) {
  const node = div({ class: 'section' });

  const rows = [
    ['Version', meta.version],
    ['Your books are kept in', meta.dataDir],
    ['Backups', `${meta.dataDir}\\backups — one per day, 30 kept`],
    ['Storage', meta.storage.adapter === 'json' ? 'A single JSON file, written safely on every change' : meta.storage.adapter],
  ];

  append(node, [
    div({ class: 'section__head' }, div({ class: 'section__title', text: 'About' })),
    div(
      { class: 'rows' },
      rows.map(([title, value]) =>
        div({ class: 'row row--static' }, [
          div({ class: 'row__main' }, [
            div({ class: 'row__sub', text: title }),
            div({ style: { overflowWrap: 'anywhere' }, text: value }),
          ]),
        ])
      )
    ),
    div({
      class: 'faint',
      style: { marginTop: 'var(--space-3)' },
      text: 'To move the shop to another computer, copy that folder across after installing ShopWise there.',
    }),
  ]);

  return node;
}
