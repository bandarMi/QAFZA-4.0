/**
 * A sortable table with a CSV download.
 *
 * Sorting happens client-side over the rows already fetched, which is the right
 * trade-off here: every list in this app is paged or capped, so the rows on screen
 * are the rows to sort, and it stays instant with no extra round trip.
 *
 * The CSV is generated from the same column definitions, so what downloads is
 * exactly the table as configured — not a different shape the user has to reconcile.
 */
import { useMemo, useState, type ReactNode } from 'react';

export type Column<T> = {
  key: string;
  label: string;
  /** Sort/export value. Defaults to `row[key]`. */
  value?: (row: T) => string | number | null | undefined;
  /** Cell content. Defaults to the value. */
  render?: (row: T) => ReactNode;
  align?: 'start' | 'end';
  sortable?: boolean;
  className?: string;
};

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const val = (r: T, c: Column<T>) => (c.value ? c.value(r) : (r as any)[c.key]);
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    columns.map(c => esc(c.label)).join(','),
    ...rows.map(r => columns.map(c => esc(val(r, c))).join(',')),
  ].join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  // A BOM so Excel opens UTF-8 (and Arabic names) correctly rather than as mojibake.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function DataTable<T>({ rows, columns, onRowClick, rowKey, empty, maxHeight, stickyHeader = true }: {
  rows: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  rowKey: (row: T, i: number) => string | number;
  empty?: ReactNode;
  maxHeight?: string;
  stickyHeader?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return rows;
    const val = (r: T) => (col.value ? col.value(r) : (r as any)[col.key]);
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;                    // blanks always sink
      if (y == null) return -1;
      const cmp = typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const toggle = (key: string) =>
    setSort(s => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  if (!rows.length && empty) return <>{empty}</>;

  return (
    <div className="scroll-x" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <table className="w-full border-collapse">
        <thead className={stickyHeader ? 'sticky top-0 bg-surface-raised z-[1]' : ''}>
          <tr>
            {columns.map(c => {
              const on = sort?.key === c.key;
              const sortable = c.sortable !== false;
              return (
                <th key={c.key} scope="col"
                    className={`th ${sortable ? 'th-sortable' : ''} ${c.align === 'end' ? 'text-end' : ''} ${c.className ?? ''}`}
                    aria-sort={on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    onClick={sortable ? () => toggle(c.key) : undefined}
                    title={sortable ? `Sort by ${c.label}` : undefined}>
                  {c.label}
                  {sortable && <span className={`ms-1 ${on ? 'text-brand-primary' : 'text-ink-disabled/50'}`}>
                    {on ? (sort!.dir === 'asc' ? '↑' : '↓') : '↕'}
                  </span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={rowKey(r, i)}
                className={onRowClick ? 'hover:bg-surface-sunken/60 cursor-pointer' : 'hover:bg-surface-sunken/40'}
                onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map(c => (
                <td key={c.key} className={`td ${c.align === 'end' ? 'text-end tabular-nums' : ''} ${c.className ?? ''}`}>
                  {c.render ? c.render(r) : ((c.value ? c.value(r) : (r as any)[c.key]) ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Standard "download what I'm looking at" button. */
export function CsvButton<T>({ rows, columns, filename }: { rows: T[]; columns: Column<T>[]; filename: string }) {
  return (
    <button className="btn-ghost" disabled={!rows.length}
            onClick={() => downloadCsv(filename, toCsv(rows, columns))}
            title="Download these rows as CSV">↓ CSV</button>
  );
}
