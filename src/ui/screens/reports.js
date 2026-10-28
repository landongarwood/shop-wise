import { div, button, input, append, span } from '../core/dom.js';
import { stat, emptyState } from '../widgets/states.js';

/**
 * What sold, over whatever stretch of time you ask for.
 *
 * The periods people actually ask for are one tap each; a custom range is there
 * for everything else. Below the totals, products are ranked by the money they
 * brought in, which answers "what should I reorder" and "what is not worth
 * stocking" at the same time.
 */
const PERIODS = [
  { preset: 'today', label: 'Today' },
  { preset: 'yesterday', label: 'Yesterday' },
  { preset: 'week', label: 'This week' },
  { preset: 'month', label: 'This month' },
  { preset: 'lastMonth', label: 'Last month' },
  { preset: 'year', label: 'This year' },
  { preset: 'all', label: 'All time' },
];

export async function reports(ctx) {
  const { api, format, go, params } = ctx;

  const preset = params.from || params.to ? null : params.preset ?? 'month';
  const query = new URLSearchParams();
  if (preset) query.set('preset', preset);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);

  const report = await api.get(`/reports/sales?${query}`);

  /* ---------- period controls ---------- */

  const chips = div(
    { class: 'chips', style: { marginBottom: 'var(--space-3)' } },
    PERIODS.map((period) =>
      button({
        class: 'chip',
        text: period.label,
        style:
          preset === period.preset
            ? { background: 'var(--accent)', borderColor: 'transparent', color: 'var(--accent-text)' }
            : {},
        onclick: () => go('reports', { preset: period.preset }, { replace: true }),
      })
    )
  );

  const from = input({ class: 'input', type: 'date', value: params.from ?? report.range.from ?? '', ariaLabel: 'From' });
  const to = input({ class: 'input', type: 'date', value: params.to ?? report.range.to ?? '', ariaLabel: 'To' });

  const custom = div({ class: 'inline', style: { marginBottom: 'var(--space-5)' } }, [
    span({ class: 'faint', text: 'or pick dates' }),
    div({ class: 'grow' }, from),
    span({ class: 'faint', text: 'to' }),
    div({ class: 'grow' }, to),
    button({
      class: 'button',
      text: 'Show',
      onclick: () => {
        if (from.value && to.value) go('reports', { from: from.value, to: to.value }, { replace: true });
      },
    }),
  ]);

  /* ---------- figures ---------- */

  const totals = div({ class: 'summary' }, [
    stat({
      label: 'Sold',
      value: format.money(report.totals.salesTotal),
      hint: `${report.totals.salesCount} ${report.totals.salesCount === 1 ? 'sale' : 'sales'}`,
    }),
    stat({
      label: 'Items out',
      value: format.quantity(report.totals.itemCount),
      hint: 'units across all products',
    }),
    stat({
      label: 'Paid to you',
      value: format.money(report.totals.paymentsTotal),
      hint: `${report.totals.paymentsCount} ${report.totals.paymentsCount === 1 ? 'payment' : 'payments'}`,
      tone: report.totals.paymentsTotal > 0 ? 'paid' : null,
    }),
    stat({
      label: 'Still unpaid',
      value: format.money(Math.max(0, report.totals.salesTotal - report.totals.paymentsTotal)),
      hint: 'sold minus paid, this period',
      tone: report.totals.salesTotal > report.totals.paymentsTotal ? 'debt' : null,
    }),
  ]);

  if (!report.totals.salesCount) {
    return {
      title: 'Sales report',
      subtitle: report.range.label,
      body: div({}, [
        chips,
        custom,
        emptyState({ title: `Nothing sold in ${report.range.label.toLowerCase()}`, message: 'Try a longer period.' }),
      ]),
    };
  }

  /* ---------- breakdowns ---------- */

  const productRows = div(
    { class: 'rows' },
    report.byProduct.map((row) =>
      div({ class: 'row row--static' }, [
        div({ class: 'row__main' }, [
          div({ class: 'row__title', text: row.productName }),
          div({
            class: 'row__sub tnum',
            text: `${format.quantity(row.quantity)} ${row.unit ?? ''} · average ${format.money(row.averagePrice)}`.replace(
              '  ',
              ' '
            ),
          }),
        ]),
        div({ class: 'row__end' }, [
          div({ class: 'row__amount tnum', text: format.money(row.revenue) }),
          div({ class: 'faint tnum', text: `${share(row.revenue, report.totals.salesTotal)}%` }),
        ]),
      ])
    )
  );

  const customerRows = div(
    { class: 'rows' },
    report.byCustomer.map((row) =>
      button({ class: 'row', onclick: () => go('customer', { id: row.customerId }) }, [
        div({ class: 'row__main' }, [
          div({ class: 'row__title', text: row.customerName }),
          div({ class: 'row__sub', text: `${row.saleCount} ${row.saleCount === 1 ? 'sale' : 'sales'}` }),
        ]),
        div({ class: 'row__end' }, div({ class: 'row__amount tnum', text: format.money(row.total) })),
      ])
    )
  );

  const dayRows =
    report.byDay.length > 1
      ? div(
          { class: 'rows' },
          report.byDay
            .slice()
            .reverse()
            .map((row) =>
              div({ class: 'row row--static' }, [
                div({ class: 'row__main' }, [
                  div({ class: 'row__title', text: format.relativeDay(`${row.day}T12:00:00`) }),
                  div({ class: 'row__sub', text: `${row.salesCount} ${row.salesCount === 1 ? 'sale' : 'sales'}` }),
                ]),
                div({ class: 'row__end' }, [
                  div({ class: 'row__amount tnum', text: format.money(row.salesTotal) }),
                  row.paymentsTotal
                    ? div({ class: 'faint tnum money--paid', text: `${format.money(row.paymentsTotal)} paid` })
                    : null,
                ]),
              ])
            )
        )
      : null;

  const body = div({}, [
    chips,
    custom,
    totals,
    section('What sold', productRows),
    section('Who bought', customerRows),
    dayRows ? section('Day by day', dayRows) : null,
  ]);

  return {
    title: 'Sales report',
    subtitle: `${report.range.label}${report.range.from ? ` · ${format.day(`${report.range.from}T12:00:00`)} to ${format.day(`${report.range.to}T12:00:00`)}` : ''}`,
    body,
  };
}

function section(title, content) {
  const node = div({ class: 'section' });
  append(node, [div({ class: 'section__head' }, div({ class: 'section__title', text: title })), content]);
  return node;
}

const share = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
