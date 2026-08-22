import BetterSqlite3 from 'better-sqlite3';
import type { Database } from '../../src/platform';
import { migrate } from '../../src/model/migrations';

export function wrap(raw: BetterSqlite3.Database): Database {
  return {
    exec: (sql, params = []) => { params.length ? raw.prepare(sql).run(...params) : raw.exec(sql); },
    query: <T>(sql: string, params: unknown[] = []) => raw.prepare(sql).all(...params) as T[],
    transaction: (fn) => raw.transaction(fn)(),
  };
}

export function memoryDb(): Database {
  const db = wrap(new BetterSqlite3(':memory:'));
  migrate(db);
  return db;
}
