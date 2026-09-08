/**
 * CSV date parsing. Slash dates are genuinely ambiguous, and getting the default
 * wrong silently shifts every imported date — so the choice is pinned here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __isoDateForTest as isoDate } from './ingest.js';

const cases: Array<[string, string | null]> = [
  ['2026-03-01', '2026-03-01'],
  ['2026-03-01T09:30:00', '2026-03-01'],
  ['01/03/2026', '2026-03-01'],   // ambiguous -> day-first (1 March)
  ['13/03/2026', '2026-03-13'],   // 13 cannot be a month -> day-first
  ['03/13/2026', '2026-03-13'],   // 13 in second position forces month-first
  ['01-03-2026', '2026-03-01'],
  ['01.03.2026', '2026-03-01'],
  ['', null],
  ['   ', null],
  ['not a date', null],
];

for (const [input, want] of cases) {
  test(`parses ${JSON.stringify(input)} as ${want}`, () => {
    assert.equal(isoDate(input), want);
  });
}
