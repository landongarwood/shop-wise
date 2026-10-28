import { el, div, append, clear } from '../core/dom.js';

/**
 * A dense, sortable data table.
 *
 * Figures are what these screens are for, so this is a real table: fixed
 * columns that read down, numbers right-aligned on tabular figures so digits
 * line up, a sticky header that stays put while hundreds of rows scroll under
 * it, and rows tight enough to compare a dozen at a glance.
 *
 * Columns describe themselves — how to render a cell, how to sort, whether the
 * value is a number — so a screen declares its table rather than assembling
 * one.
 *
 * @param {object} options
 * @param {Array<{
 *   key: string,
 *   label: string,
 *   cell: (row: any) => Node|string,
 *   sort?: (a: any, b: any) => number,
 *   numeric?: boolean,
 *   strong?: boolean,
 *   width?: string,
 *   title?: string,
 * }>} options.columns
 * @param {Array} options.rows
 * @param {{key: string, direction: 'asc'|'desc'}} [options.initialSort]
 * @param {(row: any) => void} [options.onRowClick]
 * @param {string} [options.empty]
 * @param {boolean} [options.scroll] keep the header in view and scroll the body
 */
export function dataTable({
  columns,
  rows,
  initialSort = null,
  onRowClick = null,
  empty = 'Nothing to show.',
  scroll = true,
}) {
  let current = rows;
  let sort = initialSort;

  const body = el('tbody');

  const header = el(
    'tr',
    {},
    columns.map((column) => {
      const sortable = Boolean(column.sort);
      const cell = el('th', {
        scope: 'col',
        class: [column.numeric ? 'table__num' : '', sortable ? 'table__th--sortable' : ''].join(' ').trim(),
        style: column.width ? { width: column.width } : {},
        title: column.title ?? (sortable ? `Sort by ${column.label}` : ''),
        ariaSort: 'none',
      });

      append(cell, [
        column.label,
        sortable ? el('span', { class: 'table__caret', text: '' }) : null,
      ]);

      if (sortable) {
        cell.addEventListener('click', () => {
          const sameColumn = sort?.key === column.key;
          sort = {
            key: column.key,
            // A second click on the same heading flips it; a new heading starts
            // in its natural direction — A-Z for text, largest first for money.
            direction: sameColumn && sort.direction === 'asc' ? 'desc' : sameColumn ? 'asc' : column.numeric ? 'desc' : 'asc',
          };
          draw();
        });
      }

      return cell;
    })
  );

  function draw() {
    const ordered = current.slice();

    if (sort) {
      const column = columns.find((candidate) => candidate.key === sort.key);
      if (column?.sort) {
        ordered.sort(column.sort);
        if (sort.direction === 'desc') ordered.reverse();
      }
    }

    // Reflect the sort in the header, for sighted users and assistive tech alike.
    header.querySelectorAll('th').forEach((cell, index) => {
      const column = columns[index];
      const active = sort?.key === column.key;
      const caret = cell.querySelector('.table__caret');

      cell.classList.toggle('table__th--active', active);
      cell.setAttribute('aria-sort', active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
      if (caret) caret.textContent = active ? (sort.direction === 'asc' ? '▲' : '▼') : '';
    });

    clear(body);

    if (!ordered.length) {
      append(
        body,
        el('tr', { class: 'table__empty' }, el('td', { colSpan: columns.length, class: 'soft', text: empty }))
      );
      return;
    }

    append(
      body,
      ordered.map((row) => {
        const tr = el('tr', onRowClick ? { class: 'table__row--click', tabIndex: 0 } : {});

        if (onRowClick) {
          tr.addEventListener('click', (event) => {
            // Let a button inside the row do its own job.
            if (event.target.closest('button')) return;
            onRowClick(row);
          });
          tr.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onRowClick(row);
          });
        }

        append(
          tr,
          columns.map((column) =>
            el(
              'td',
              {
                class: [column.numeric ? 'table__num' : '', column.strong ? 'table__strong' : ''].join(' ').trim(),
              },
              column.cell(row)
            )
          )
        );
        return tr;
      })
    );
  }

  draw();

  const table = el('table', { class: 'table' }, [el('thead', {}, header), body]);
  const node = div({ class: `table-wrap${scroll ? ' table-wrap--scroll' : ''}` }, table);

  return {
    node,
    /** Re-renders with a new set of rows, keeping the current sort. */
    setRows(next) {
      current = next;
      draw();
    },
    get sort() {
      return sort;
    },
  };
}

/** A coloured dot for at-a-glance status in a narrow leading column. */
export function statusDot(tone, label) {
  return el('span', { class: `dot dot--${tone}`, title: label, ariaLabel: label, role: 'img' });
}

/** Common comparators, so columns do not each reinvent them. */
export const by = {
  text: (pick) => (a, b) => String(pick(a) ?? '').localeCompare(String(pick(b) ?? ''), undefined, { sensitivity: 'base' }),
  number: (pick) => (a, b) => (Number(pick(a)) || 0) - (Number(pick(b)) || 0),
};
