/**
 * A thin better-sqlite3-shaped adapter over Node's built-in `node:sqlite`.
 *
 * WHY THIS EXISTS
 * ---------------
 * better-sqlite3 is a native addon: it needs a compiled binary per platform, which
 * makes a zero-install, no-admin Windows build impossible to produce reliably.
 * `node:sqlite` ships inside Node itself (stable and unflagged from Node 24), so
 * depending on it removes the project's only native dependency — the app becomes
 * pure JavaScript and the portable Windows bundle is just `node.exe` plus files.
 *
 * It presents only the surface this codebase actually uses, and papers over the
 * three places the two APIs genuinely differ:
 *
 *  1. EXTRA NAMED PARAMETERS. better-sqlite3 walks the statement's parameters and
 *     looks each one up in the object, so unused object keys are harmless. It is a
 *     pattern this codebase uses constantly — `{ ...params, hoursMin, hoursMax }`
 *     against SQL that only mentions `@hoursMin` when a filter is set.
 *     `node:sqlite` walks the object instead and throws `Unknown named parameter`.
 *     So the adapter parses each statement's named parameters once at prepare time
 *     and passes through only those keys.
 *  2. `undefined` VALUES. Not bindable; converted to NULL, which is what every
 *     call site means by it.
 *  3. `db.transaction(fn)` and `db.pragma(...)` do not exist; both are implemented
 *     here, with SAVEPOINTs so a nested transaction still behaves.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite';

export type RunResult = { changes: number; lastInsertRowid: number };

/** Named parameters a statement declares, ignoring anything inside string literals. */
function namedParams(sql: string): Set<string> {
  const stripped = sql.replace(/'(?:[^']|'')*'/g, "''");
  const out = new Set<string>();
  for (const m of stripped.matchAll(/[@:$]([A-Za-z_][A-Za-z0-9_]*)/g)) out.add(m[1]!);
  return out;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

const toNumber = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : Number(v ?? 0));

class Statement {
  #stmt: StatementSync;
  #named: Set<string>;

  constructor(stmt: StatementSync, sql: string) {
    this.#stmt = stmt;
    this.#named = namedParams(sql);
  }

  /** Drop keys the statement never declares, and turn `undefined` into NULL. */
  #bind(args: unknown[]): unknown[] {
    if (args.length === 1 && isPlainObject(args[0])) {
      const src = args[0];
      const out: Record<string, unknown> = {};
      for (const key of this.#named) out[key] = src[key] === undefined ? null : src[key];
      return [out];
    }
    return args.map(a => (a === undefined ? null : a));
  }

  get(...args: unknown[]): any { return this.#stmt.get(...(this.#bind(args) as any)); }
  all(...args: unknown[]): any[] { return this.#stmt.all(...(this.#bind(args) as any)) as any[]; }

  run(...args: unknown[]): RunResult {
    const r = this.#stmt.run(...(this.#bind(args) as any));
    return { changes: toNumber(r.changes), lastInsertRowid: toNumber(r.lastInsertRowid) };
  }
}

export class Database {
  #db: DatabaseSync;
  #depth = 0;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
  }

  prepare(sql: string): Statement { return new Statement(this.#db.prepare(sql), sql); }
  exec(sql: string): void { this.#db.exec(sql); }
  close(): void { this.#db.close(); }

  /** `db.pragma('journal_mode = WAL')`, or `db.pragma('user_version')` to read one. */
  pragma(statement: string): unknown {
    if (statement.includes('=')) { this.#db.exec(`PRAGMA ${statement}`); return undefined; }
    return this.#db.prepare(`PRAGMA ${statement}`).get();
  }

  /**
   * better-sqlite3's `db.transaction(fn)` returns a callable that wraps `fn`.
   * Nested calls use SAVEPOINTs so an inner rollback doesn't discard outer work.
   */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A): R => {
      const nested = this.#depth > 0;
      const name = `sp_${this.#depth}`;
      this.#db.exec(nested ? `SAVEPOINT ${name}` : 'BEGIN');
      this.#depth++;
      try {
        const result = fn(...args);
        this.#depth--;
        this.#db.exec(nested ? `RELEASE ${name}` : 'COMMIT');
        return result;
      } catch (err) {
        this.#depth--;
        try { this.#db.exec(nested ? `ROLLBACK TO ${name}; RELEASE ${name}` : 'ROLLBACK'); } catch { /* already unwound */ }
        throw err;
      }
    };
  }
}

export default Database;
