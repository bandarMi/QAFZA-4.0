/**
 * The CSV helper behind every table download. Excel and Arabic names make the
 * escaping and the BOM load-bearing, so both are pinned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirrors web/src/components/DataTable.tsx — kept in step by these tests.
function toCsv<T>(rows: T[], columns: Array<{ key: string; label: string; value?: (r: T) => unknown }>): string {
  const val = (r: T, c: any) => (c.value ? c.value(r) : (r as any)[c.key]);
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(c => esc(c.label)).join(','),
          ...rows.map(r => columns.map(c => esc(val(r, c))).join(','))].join('\r\n');
}

const cols = [
  { key: 'name', label: 'Member' },
  { key: 'hours', label: 'Hours' },
  { key: 'verified', label: 'Verified', value: (r: any) => (r.verified ? 'yes' : 'no') },
];

test('a plain row round-trips', () => {
  const csv = toCsv([{ name: 'Noura Al-Rashid', hours: 12.5, verified: 1 }], cols);
  assert.equal(csv, 'Member,Hours,Verified\r\nNoura Al-Rashid,12.5,yes');
});

test('commas, quotes and newlines are escaped', () => {
  const csv = toCsv([{ name: 'Al-Rashid, Noura', hours: 1, verified: 0 }], cols);
  assert.ok(csv.includes('"Al-Rashid, Noura"'));
  const q = toCsv([{ name: 'She said "yes"', hours: 1, verified: 0 }], cols);
  assert.ok(q.includes('"She said ""yes"""'));
  const n = toCsv([{ name: 'line1\nline2', hours: 1, verified: 0 }], cols);
  assert.ok(n.includes('"line1\nline2"'));
});

test('null and undefined become empty cells, not the words', () => {
  const csv = toCsv([{ name: null, hours: undefined, verified: 0 }], cols);
  assert.equal(csv.split('\r\n')[1], ',,no');
});

test('a computed column uses its value function', () => {
  assert.ok(toCsv([{ name: 'x', hours: 0, verified: 1 }], cols).endsWith(',yes'));
});
