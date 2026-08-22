import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { memoryDb } from './helpers/db';
import { migrate, SCHEMA_VERSION } from '../src';

describe('schema', () => {
  it('migrates cleanly and idempotently', () => {
    const db = memoryDb();
    migrate(db);
    expect(db.query<{ version: number }>('SELECT version FROM migrations')).toEqual([{ version: SCHEMA_VERSION }]);
    const tables = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name);
    for (const t of ['items', 'files', 'tags', 'spaces', 'space_items', 'jobs', 'ops', 'cell_clock', 'cell_history', 'blob_index', 'sync_cursor', 'sync_errors', 'migrations', 'items_fts'])
      expect(tables).toContain(t);
  });

  it('has FTS5 with external content', () => {
    const db = memoryDb();
    db.exec('INSERT INTO items_fts(rowid, title, body, summary, ocr_text, tags, domain) VALUES (1, ?, ?, ?, ?, ?, ?)',
      ['Café notes', 'body', '', '', 'coffee', 'example.com']);
    expect(db.query<{ rowid: number }>('SELECT rowid FROM items_fts WHERE items_fts MATCH ?', ['cafe'])).toEqual([{ rowid: 1 }]);
  });
});

describe('core purity', () => {
  it('src/ imports nothing from node, react-native or the DOM', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
    walk(join(__dirname, '..', 'src'));
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/from ['"](node:|fs['"]|path['"]|react|better-sqlite3)/);
    }
  });
});
