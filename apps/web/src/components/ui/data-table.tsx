import type { ReactNode } from 'react';

export interface DataColumn<Row> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: Row) => ReactNode;
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  nowrap = false,
}: {
  caption: string;
  nowrap?: boolean;
  columns: readonly DataColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
}) {
  // Contain absolutely positioned screen-reader labels when rows scroll sideways.
  return (
    <div
      className="relative min-w-0 overflow-x-auto"
      tabIndex={0}
      role="group"
      aria-label={caption + ' — scroll horizontally'}
    >
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`border-b border-slate-200 bg-brand-800 px-3 py-2 text-xs font-semibold text-white ${nowrap ? 'whitespace-nowrap' : ''} ${
                  column.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&_a]:min-h-7 [&_button]:min-h-7 [&_button]:rounded-md [&_button]:px-2 [&_button]:text-xs">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="transition-colors hover:bg-slate-50/70"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`border-b border-slate-100 px-3 py-1.5 text-slate-700 ${nowrap ? 'whitespace-nowrap' : ''} ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
