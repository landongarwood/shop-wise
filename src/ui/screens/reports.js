import { div, button, input, span, el } from '../core/dom.js';
import { stat, emptyState } from '../widgets/states.js';
import { dataTable, by } from '../widgets/table.js';

/**
 * The sales ledger.
 *
 * One table, one row per line of a sale, so "what went out and to whom" is a
 * single list that can be sorted and narrowed rather than several summaries to
 * read past. Date first, because that is the default order and what the eye
 * returns to; the names next; the figures together on the right where they can
 * be compared down a column.
 *
 * Period, product and customer all narrow the same table, and every figure
 * above it describes exactly the rows on show.
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

  const preset = params.from || params.to ? null : params.preset ?? 'today';

  const query = new URLSearchParams();
  if (preset) query.set('preset', preset);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.productId) query.set('productId', params.productId);
  if (params.customerId) query.set('customerId', params.customerId);

  const report = await api.get(`/reports/sales?${query}`);

  /** Re-opens this screen with one thing changed and everything else kept. */
  const applyFilter = (changes) =>
    go(
      'reports',
      {
        ...(preset ? { preset } : { from: params.from, to: params.to }),
        productId: params.productId,
        customerId: params.customerId,
        ...changes,
      },
      { replace: true }
    );

  /* ---------- period ---------- */

  const chips = div(
    { class: 'chips', style: { marginBottom: 'var(--space-3)' } },
    PERIODS.map((period) =>
      button({
        class: `chip${preset === period.preset ? ' chip--active' : ''}`,
        text: period.label,
        onclick: () => applyFilter({ preset: period.preset, from: undefined, to: undefined }),
      })
    )
  );

  const from = input({ class: 'input', type: 'date', value: params.from ?? report.range.from ?? '', ariaLabel: 'From' });
  const to = input({ class: 'input', type: 'date', value: params.to ?? report.range.to ?? '', ariaLabel: 'To' });

  /*
   * Dates re-query as soon as one is picked, like the product and customer
   * choosers — a button to confirm a choice you have already made is a step
   * that only exists to be forgotten.
   *
   * `change` rather than `input`, so a half-typed year does not run a query,
   * and the far end is dragged along rather than letting the range invert,
   * which the server would refuse outright.
   */
  const applyDates = (moved) => {
    if (!from.value || !to.value) return;

    if (from.value > to.value) {
      if (moved === 'from') to.value = from.value;
      else from.value = to.value;
    }
    applyFilter({ from: from.value, to: to.value, preset: undefined });
  };

  from.addEventListener('change', () => applyDates('from'));
  to.addEventListener('change', () => applyDates('to'));

  /* ---------- product / customer ---------- */

  const chooser = ({ label, options, selected, allLabel, onPick }) => {
    const control = el(
      'select',
      {
        class: 'input input--select',
        ariaLabel: label,
        onchange: () => onPick(control.value || undefined),
      },
      [
        el('option', { value: '', text: allLabel }),
        ...options.map((option) =>
          el('option', {
            value: option.id,
            text: `${option.name} (${option.count})`,
            selected: option.id === selected,
          })
        ),
      ]
    );
    return control;
  };

  const productChooser = chooser({
    label: 'Filter by product',
    options: report.options.products,
    selected: params.productId,
    allLabel: 'All products',
    onPick: (productId) => applyFilter({ productId }),
  });

  const customerChooser = chooser({
    label: 'Filter by customer',
    options: report.options.customers,
    selected: params.customerId,
    allLabel: 'All customers',
    onPick: (customerId) => applyFilter({ customerId }),
  });

  const filtered = Boolean(params.productId || params.customerId);

  const toolbar = div({ class: 'toolbar' }, [
    div({ class: 'toolbar__field' }, productChooser),
    div({ class: 'toolbar__field' }, customerChooser),
    div({ class: 'inline' }, [
      span({ class: 'faint', text: 'dates' }),
      div({ style: { width: 'min(158px, 36vw)' } }, from),
      span({ class: 'faint', text: 'to' }),
      div({ style: { width: 'min(158px, 36vw)' } }, to),
    ]),
    filtered
      ? button({
          class: 'button button--quiet',
          text: 'Clear filters',
          onclick: () => applyFilter({ productId: undefined, customerId: undefined }),
        })
      : null,
  ]);

  /* ---------- figures ---------- */

  const totals = div({ class: 'summary' }, [
    stat({
      label: 'Sold',
      value: format.money(report.totals.salesTotal),
      hint: `${report.totals.saleCount} ${report.totals.saleCount === 1 ? 'sale' : 'sales'}`,
    }),
    stat({
      label: 'Items out',
      value: format.quantity(report.totals.itemCount),
      hint: `over ${report.totals.lineCount} ${report.totals.lineCount === 1 ? 'line' : 'lines'}`,
    }),
    stat({
      label: 'Paid to you',
      value: format.money(report.totals.paymentsTotal),
      hint: report.totals.paymentsApplyToFilter
        ? `${report.totals.paymentsCount} ${report.totals.paymentsCount === 1 ? 'payment' : 'payments'}`
        : 'payments are not recorded per product',
      tone: report.totals.paymentsTotal > 0 ? 'paid' : null,
    }),
    stat({
      label: 'Average sale',
      value: format.money(
        report.totals.saleCount ? Math.round(report.totals.salesTotal / report.totals.saleCount) : 0
      ),
    }),
  ]);

  const head = div({}, [chips, toolbar, totals]);

  if (!report.lines.length) {
    return {
      title: 'Sales report',
      subtitle: describeRange(report, format),
      body: div({}, [
        head,
        emptyState({
          title: filtered ? 'Nothing matches those filters' : `Nothing sold in ${report.range.label.toLowerCase()}`,
          message: filtered ? 'Try a wider period, or clear the filters.' : 'Try a longer period.',
        }),
      ]),
    };
  }

  /* ---------- the ledger ---------- */

  const table = dataTable({
    rows: report.lines,
    initialSort: { key: 'at', direction: 'desc' },
    onRowClick: (line) => go('customer', { id: line.customerId }),
    columns: [
      {
        key: 'at',
        label: 'Date',
        sort: by.text((line) => line.at),
        cell: (line) => format.relativeDay(line.at),
      },
      {
        key: 'product',
        label: 'Product',
        sort: by.text((line) => line.productName),
        cell: (line) => line.productName,
      },
      {
        key: 'customer',
        label: 'Customer',
        sort: by.text((line) => line.customerName),
        cell: (line) => line.customerName,
      },
      {
        key: 'quantity',
        label: 'Qty',
        numeric: true,
        sort: by.number((line) => line.quantity),
        cell: (line) => `${format.quantity(line.quantity)} ${line.unit ?? ''}`.trim(),
      },
      {
        key: 'unitPrice',
        label: 'Price',
        numeric: true,
        sort: by.number((line) => line.unitPrice),
        cell: (line) => format.money(line.unitPrice),
      },
      {
        key: 'lineTotal',
        label: 'Total',
        numeric: true,
        strong: true,
        sort: by.number((line) => line.lineTotal),
        cell: (line) => format.money(line.lineTotal),
      },
    ],
  });

  const countLine = div({
    class: 'picker__count',
    text: report.truncated
      ? `showing the latest ${report.lines.length} lines — narrow the period to see the rest`
      : `${report.totals.lineCount} ${report.totals.lineCount === 1 ? 'line' : 'lines'}`,
  });

  return {
    title: 'Sales report',
    subtitle: describeRange(report, format),
    body: div({}, [head, countLine, table.node]),
  };
}

function describeRange(report, format) {
  const dates = report.range.from
    ? ` · ${format.day(`${report.range.from}T12:00:00`)} to ${format.day(`${report.range.to}T12:00:00`)}`
    : '';
  return `${report.range.label}${dates}`;
}
