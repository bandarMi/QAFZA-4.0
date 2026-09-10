/**
 * The adapter's job is to hide three real differences between better-sqlite3 and
 * node:sqlite. Each one is pinned here, because a regression would be silent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from './sqlite.js';

function fresh() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, n INTEGER)');
  return db;
}

test('run() reports changes and lastInsertRowid as plain numbers', () => {
  const db = fresh();
  const r = db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('a', 1);
  assert.equal(r.changes, 1);
  assert.equal(r.lastInsertRowid, 1);
  assert.equal(typeof r.lastInsertRowid, 'number');
});

test('extra named parameters are ignored, as better-sqlite3 ignores them', () => {
  const db = fresh();
  db.prepare('INSERT INTO t (name, n) VALUES (@name, @n)').run({ name: 'a', n: 1 });
  // The codebase builds SQL conditionally and passes a superset of params.
  const row = db.prepare('SELECT * FROM t WHERE name = @name')
    .get({ name: 'a', hoursMin: 5, hoursMax: undefined, nope: 'x' });
  assert.equal(row.n, 1);
});

test('undefined binds as NULL rather than throwing', () => {
  const db = fresh();
  db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('a', undefined);
  assert.equal(db.prepare('SELECT n FROM t').get().n, null);
  db.prepare('INSERT INTO t (name, n) VALUES (@name, @n)').run({ name: 'b', n: undefined });
  assert.equal(db.prepare('SELECT n FROM t WHERE name = ?').get('b').n, null);
});

test('a named parameter inside a string literal is not treated as a parameter', () => {
  const db = fresh();
  const row = db.prepare("SELECT 'user@example.com' AS email, @n AS n").get({ n: 3 });
  assert.equal(row.email, 'user@example.com');
  assert.equal(row.n, 3);
});

test('transaction() commits on success', () => {
  const db = fresh();
  db.transaction(() => {
    db.prepare('INSERT INTO t (name) VALUES (?)').run('a');
    db.prepare('INSERT INTO t (name) VALUES (?)').run('b');
  })();
  assert.equal(db.prepare('SELECT COUNT(*) c FROM t').get().c, 2);
});

test('transaction() rolls back on throw and rethrows', () => {
  const db = fresh();
  assert.throws(() => db.transaction(() => {
    db.prepare('INSERT INTO t (name) VALUES (?)').run('a');
    throw new Error('boom');
  })(), /boom/);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM t').get().c, 0);
});

test('a nested transaction rolls back to its savepoint without losing outer work', () => {
  const db = fresh();
  db.transaction(() => {
    db.prepare('INSERT INTO t (name) VALUES (?)').run('outer');
    try {
      db.transaction(() => {
        db.prepare('INSERT INTO t (name) VALUES (?)').run('inner');
        throw new Error('inner failed');
      })();
    } catch { /* swallowed on purpose */ }
  })();
  const names = db.prepare('SELECT name FROM t ORDER BY id').all().map((r: any) => r.name);
  assert.deepEqual(names, ['outer']);
});

test('transaction() passes arguments through and returns the result', () => {
  const db = fresh();
  const add = db.transaction((name: string, n: number) => {
    db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run(name, n);
    return db.prepare('SELECT COUNT(*) c FROM t').get().c;
  });
  assert.equal(add('a', 1), 1);
  assert.equal(add('b', 2), 2);
});

test('pragma() sets and reads', () => {
  const db = fresh();
  db.pragma('foreign_keys = ON');
  assert.equal((db.pragma('foreign_keys') as any).foreign_keys, 1);
});
