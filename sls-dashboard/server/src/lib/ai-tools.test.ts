/**
 * The read-only SQL guardrail. The AI gets an escape hatch for questions the
 * typed tools cannot express; these cases are what keeps it an escape hatch and
 * not a write path.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardSql } from './ai-tools.js';

const allowed: Array<[string, string]> = [
  ['a plain select', 'SELECT name FROM members LIMIT 5'],
  ['a join across allowed tables', 'SELECT m.name, SUM(l.hours) FROM engagement_logs l JOIN members m ON m.id=l.member_id GROUP BY m.id LIMIT 10'],
  ['a CTE', 'WITH top AS (SELECT member_id, SUM(hours) h FROM engagement_logs GROUP BY member_id) SELECT * FROM top LIMIT 5'],
  ['a trailing semicolon is tolerated', 'SELECT 1 FROM members LIMIT 1;'],
];

for (const [name, sql] of allowed) {
  test(`allows ${name}`, () => {
    const r = guardSql(sql);
    assert.equal(r.ok, true, r.ok ? '' : r.error);
  });
}

const rejected: Array<[string, string]> = [
  ['an update', 'UPDATE members SET name="x"'],
  ['an insert', 'INSERT INTO members (name) VALUES ("x")'],
  ['a delete', 'DELETE FROM members'],
  ['a drop', 'DROP TABLE members'],
  ['a write smuggled after a semicolon', 'SELECT 1 FROM members; DROP TABLE members'],
  ['a write smuggled into a subquery', 'SELECT (SELECT 1) FROM members WHERE 1=1 AND (DELETE FROM members)'],
  ['ATTACH', 'SELECT * FROM members; ATTACH DATABASE "x" AS y'],
  ['PRAGMA', 'PRAGMA table_info(members)'],
  ['a table that is not allow-listed', 'SELECT * FROM app_settings LIMIT 5'],
  ['the secrets-adjacent settings table via a join', 'SELECT m.name FROM members m JOIN app_settings s ON 1=1 LIMIT 5'],
  ['an empty statement', '   '],
];

for (const [name, sql] of rejected) {
  test(`rejects ${name}`, () => {
    const r = guardSql(sql);
    assert.equal(r.ok, false, `expected a rejection for: ${sql}`);
  });
}

test('a missing LIMIT is added rather than refused', () => {
  const r = guardSql('SELECT name FROM members');
  assert.equal(r.ok, true);
  assert.match((r as { ok: true; sql: string }).sql, /LIMIT 500$/);
});
