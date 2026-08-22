import type { Database } from '../platform';
import { SCHEMA_SQL } from './schema';

export const SCHEMA_VERSION = 1;

// Additive only: new tables/columns, never rename/drop/retype.
export const migrations: { version: number; sql: string }[] = [{ version: 1, sql: SCHEMA_SQL }];

export function migrate(db: Database, now: () => number = Date.now): void {
  db.transaction(() => {
    db.exec('CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at INTEGER)');
    const done = new Set(db.query<{ version: number }>('SELECT version FROM migrations').map((r) => r.version));
    for (const m of migrations) {
      if (done.has(m.version)) continue;
      // 0001 creates `migrations` itself; drop the bootstrap table so the schema applies verbatim.
      if (m.version === 1) db.exec('DROP TABLE migrations');
      db.exec(m.sql);
      db.exec('INSERT INTO migrations (version, applied_at) VALUES (?, ?)', [m.version, now()]);
    }
  });
}
