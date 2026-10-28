import { div, button, input, append, span } from '../core/dom.js';
import { stat, emptyState } from '../widgets/states.js';
import { dataTable, by } from '../widgets/table.js';

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
    div({ style: { width: 'min(170px, 38vw)' } }, from),
    span({ class: 'faint', text: 'to' }),
    div({ style: { width: 'min(170px, 38vw)' } }, to),
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

  const productTable = dataTable({
    rows: report.byProduct,
    initialSort: { key: 'revenue', direction: 'desc' },
    scroll: false,
    columns: [
      { key: 'name', label: 'Product', grow: true, sort: by.text((row) => row.productName), cell: (row) => row.productName },
      {
        key: 'quantity',
        label: 'Quantity',
        numeric: true,
        sort: by.number((row) => row.quantity),
        cell: (row) => `${format.quantity(row.quantity)} ${row.unit ?? ''}`.trim(),
      },
      {
        key: 'average',
        label: 'Average price',
        numeric: true,
        sort: by.number((row) => row.averagePrice),
        cell: (row) => format.money(row.averagePrice),
      },
      {
        key: 'revenue',
        label: 'Revenue',
        numeric: true,
        strong: true,
        sort: by.number((row) => row.revenue),
        cell: (row) => format.money(row.revenue),
      },
      {
        key: 'share',
        label: 'Share',
        numeric: true,
        sort: by.number((row) => row.revenue),
        cell: (row) => shareBar(row.revenue, report.totals.salesTotal),
      },
    ],
  }).node;

  const customerTable = dataTable({
    rows: report.byCustomer,
    initialSort: { key: 'total', direction: 'desc' },
    scroll: false,
    onRowClick: (row) => go('customer', { id: row.customerId }),
    columns: [
      { key: 'name', label: 'Customer', grow: true, sort: by.text((row) => row.customerName), cell: (row) => row.customerName },
      {
        key: 'sales',
        label: 'Sales',
        numeric: true,
        sort: by.number((row) => row.saleCount),
        cell: (row) => String(row.saleCount),
      },
      {
        key: 'total',
        label: 'Total',
        numeric: true,
        strong: true,
        sort: by.number((row) => row.total),
        cell: (row) => format.money(row.total),
      },
      {
        key: 'share',
        label: 'Share',
        numeric: true,
        sort: by.number((row) => row.total),
        cell: (row) => shareBar(row.total, report.totals.salesTotal),
      },
    ],
  }).node;

  const dayTable =
    report.byDay.length > 1
      ? dataTable({
          rows: report.byDay,
          initialSort: { key: 'day', direction: 'desc' },
          scroll: false,
          columns: [
            {
              key: 'day',
              label: 'Day',
              grow: true,
              sort: by.text((row) => row.day),
              cell: (row) => format.relativeDay(`${row.day}T12:00:00`),
            },
            {
              key: 'count',
              label: 'Sales',
              numeric: true,
              sort: by.number((row) => row.salesCount),
              cell: (row) => String(row.salesCount),
            },
            {
              key: 'sold',
              label: 'Sold',
              numeric: true,
              strong: true,
              sort: by.number((row) => row.salesTotal),
              cell: (row) => format.money(row.salesTotal),
            },
            {
              key: 'paid',
              label: 'Paid to you',
              numeric: true,
              sort: by.number((row) => row.paymentsTotal),
              cell: (row) =>
                row.paymentsTotal
                  ? span({ class: 'money--paid', text: format.money(row.paymentsTotal) })
                  : span({ class: 'table__sub', text: '—' }),
            },
          ],
        }).node
      : null;

  const body = div({}, [
    chips,
    custom,
    totals,
    section('What sold', productTable),
    section('Who bought', customerTable),
    dayTable ? section('Day by day', dayTable) : null,
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

/** A percentage with a proportional bar behind it: rank is read, not counted. */
function shareBar(part, whole) {
  const percent = whole > 0 ? Math.round((part / whole) * 100) : 0;

  return div({ class: 'share' }, [
    div({ class: 'share__track' }, div({ class: 'share__fill', style: { width: `${percent}%` } })),
    span({ class: 'share__value tnum', text: `${percent}%` }),
  ]);
}
