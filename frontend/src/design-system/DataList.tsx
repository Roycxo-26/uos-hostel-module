import type { ReactNode } from 'react';
import { ChevronRightIcon } from './icons';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Shown as the card title on mobile; exactly one column should set this. */
  primary?: boolean;
}

/**
 * The one list-rendering component every module screen uses. Per the user's
 * mobile-first brief: below `md`, a dense multi-column table is genuinely
 * unusable on a phone (horizontal scroll on a data table is a known-bad
 * pattern for the field users this module is built for — Wardens and
 * students, not desk staff at a wide monitor), so this renders as a stacked
 * card list instead, and only becomes a real `<table>` from `md` up. Same
 * data, same columns config, two renders — not a scaled-down table.
 */
export function DataList<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
}) {
  const primaryCol = columns.find((c) => c.primary) ?? columns[0];
  const secondaryCols = columns.filter((c) => c !== primaryCol);

  return (
    <>
      {/* Mobile: card list */}
      <ul className="divide-y divide-slate-200 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              disabled={!onRowClick}
              onClick={() => onRowClick?.(row)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left disabled:cursor-default"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium text-slate-900">{primaryCol?.render(row)}</p>
                <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                  {secondaryCols.map((col) => (
                    <div key={col.key} className="flex gap-1">
                      <dt className="font-medium text-slate-400">{col.header}:</dt>
                      <dd>{col.render(row)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {onRowClick && <ChevronRightIcon className="shrink-0 text-slate-300" />}
            </button>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
              {columns.map((col) => (
                <th key={col.key} className="px-5 py-2.5 font-medium">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-3 text-slate-700">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
