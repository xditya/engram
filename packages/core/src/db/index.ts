import { v7 as uuid } from 'uuid';
import type { Database } from '../platform';
import type { FileRow, Item, ItemType, Job, JobKind, Space, Tag } from '../model/types';
import type { Op } from '../sync/types';
import { SCHEMA_VERSION } from '../model/migrations';
import { makeHlc, type Hlc } from './hlc';
import { decodeValue, encodeValue } from './ops';

export { makeHlc, compareHlc, parseHlc, type Hlc } from './hlc';
export * from './ops';
export { traceStrength, resurfaceCandidates, type TraceInput } from './trace';

// Replicated tables: primary key column(s) and NOT NULL defaults used when a remote op creates a row.
// Composite keys are encoded in row_id as "a|b" (uuids never contain '|').
const TABLES: Record<string, { pk: string[]; cols: string[]; defaults: (deviceId: string, now: number) => Record<string, unknown> }> = {
  items: {
    pk: ['id'],
    cols: ['type', 'url', 'domain', 'title', 'body', 'summary', 'ocr_text', 'meta', 'colors', 'embedding', 'embedding_dim', 'embedding_model',
      'pinned_at', 'opened_at', 'open_count', 'resurfaced_at', 'let_go_at', 'deleted_at', 'created_at', 'updated_at', 'created_by'],
    defaults: (deviceId, now) => ({ type: 'note', open_count: 0, created_at: now, updated_at: now, created_by: deviceId }),
  },
  files: { pk: ['hash'], cols: ['item_id', 'role', 'mime', 'bytes', 'w', 'h', 'blurhash', 'deleted_at'], defaults: () => ({ item_id: '', role: 'original' }) },
  tags: { pk: ['item_id', 'tag'], cols: ['source', 'deleted_at'], defaults: () => ({ source: 'user' }) },
  spaces: { pk: ['id'], cols: ['name', 'query', 'sort', 'deleted_at'], defaults: () => ({ name: '' }) },
  space_items: { pk: ['space_id', 'item_id'], cols: ['added_at', 'deleted_at'], defaults: () => ({}) },
};

export type ListOpts = { view?: 'all' | 'trash' | 'pinned'; type?: ItemType; sort?: 'saved' | 'modified' | 'opened' | 'title'; limit?: number; offset?: number };
export type ApplyResult = 'applied' | 'lost' | 'deferred';
export type EngramDb = ReturnType<typeof createDb>;

export function createDb(
  platform: { db: Database; now(): number; deviceId: string },
  opts: { onChange?: () => void; onSkew?: (aheadMs: number) => void } = {},
) {
  const { db, now, deviceId } = platform;
  const hlc: Hlc = makeHlc(deviceId, now, opts.onSkew);
  for (const r of db.query<{ hlc: string | null }>('SELECT MAX(hlc) hlc FROM ops')) if (r.hlc) hlc.observe(r.hlc);

  // --- transaction plumbing: FTS refresh at commit, one onChange per writing tx ---
  let depth = 0;
  let wrote = false;
  const dirty = new Map<string, unknown[] | null>(); // item id -> FTS doc before this tx touched it
  const ftsDoc = (id: string): unknown[] | null => {
    const r = db.query<Item & { rowid: number }>('SELECT rowid, * FROM items WHERE id = ?', [id])[0];
    if (!r) return null;
    const tags = db.query<{ tag: string }>('SELECT tag FROM tags WHERE item_id = ? AND deleted_at IS NULL ORDER BY tag', [id]).map((t) => t.tag).join(' ');
    return [r.rowid, r.title ?? '', r.body ?? '', r.summary ?? '', r.ocr_text ?? '', tags, r.domain ?? ''];
  };
  const touch = (id: string) => { if (!dirty.has(id)) dirty.set(id, ftsDoc(id)); };
  const flushFts = () => {
    // contentless FTS5: the 'delete' command needs the old values, which is why we captured them in touch()
    for (const [id, before] of dirty) {
      if (before) db.exec("INSERT INTO items_fts(items_fts, rowid, title, body, summary, ocr_text, tags, domain) VALUES ('delete', ?, ?, ?, ?, ?, ?, ?)", before);
      const after = ftsDoc(id);
      if (after) db.exec('INSERT INTO items_fts(rowid, title, body, summary, ocr_text, tags, domain) VALUES (?, ?, ?, ?, ?, ?, ?)', after);
    }
    dirty.clear();
  };
  function tx<T>(fn: () => T): T {
    if (depth > 0) return fn();
    depth++;
    try {
      const out = db.transaction(() => { const r = fn(); flushFts(); return r; });
      const w = wrote; wrote = false;
      if (w) opts.onChange?.();
      return out;
    } finally { depth--; dirty.clear(); wrote = false; }
  }

  // --- the single cell writer; every replicated-table change goes through here ---
  const splitKey = (tbl: string, rowId: string): Record<string, string> => {
    const t = TABLES[tbl]!;
    if (t.pk.length === 1) return { [t.pk[0]!]: rowId };
    const i = rowId.indexOf('|');
    return { [t.pk[0]!]: rowId.slice(0, i), [t.pk[1]!]: rowId.slice(i + 1) };
  };
  const where = (tbl: string) => TABLES[tbl]!.pk.map((c) => `${c} = ?`).join(' AND ');
  const touchFor = (tbl: string, rowId: string) => {
    if (tbl === 'items') touch(rowId); else if (tbl === 'tags') touch(splitKey(tbl, rowId).item_id!);
  };
  const ensureRow = (tbl: string, rowId: string, opDevice: string) => {
    const row = { ...TABLES[tbl]!.defaults(opDevice, now()), ...splitKey(tbl, rowId) };
    const cols = Object.keys(row);
    touchFor(tbl, rowId);
    db.exec(`INSERT OR IGNORE INTO ${tbl} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, Object.values(row));
  };
  const insertOp = (op: Op, pushed: 0 | 1, applied: 0 | 1) => db.exec(
    'INSERT INTO ops (hlc, device_id, tbl, row_id, col, value, schema_version, pushed, applied) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [op.hlc, op.deviceId, op.tbl, op.rowId, op.col, encodeValue(op.value), op.schemaVersion, pushed, applied]);
  const history = (tbl: string, rowId: string, col: string, h: string, value: unknown) => db.exec(
    'INSERT INTO cell_history (tbl, row_id, col, hlc, device_id, value, lost_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [tbl, rowId, col, h, h.slice(19), encodeValue(value), now()]);

  function applyCell(op: Op, local: boolean): ApplyResult {
    const t = TABLES[op.tbl];
    if (!t || !t.cols.includes(op.col)) {
      if (local) throw new Error(`unknown column ${op.tbl}.${op.col}`);
      insertOp(op, 1, 0);
      wrote = true;
      return 'deferred';
    }
    ensureRow(op.tbl, op.rowId, op.deviceId);
    const key = Object.values(splitKey(op.tbl, op.rowId));
    const clock = db.query<{ hlc: string }>('SELECT hlc FROM cell_clock WHERE tbl = ? AND row_id = ? AND col = ?', [op.tbl, op.rowId, op.col])[0]?.hlc;
    insertOp(op, local ? 0 : 1, 1);
    wrote = true;
    if (!local && clock && clock >= op.hlc) {
      history(op.tbl, op.rowId, op.col, op.hlc, op.value);
      return 'lost';
    }
    if (!local && clock) {
      // ponytail: only remote wins archive the previous value; local edits would flood cell_history with open_count bumps
      const prev = db.query<{ v: unknown }>(`SELECT ${op.col} v FROM ${op.tbl} WHERE ${where(op.tbl)}`, key)[0];
      history(op.tbl, op.rowId, op.col, clock, prev?.v);
    }
    db.exec(`UPDATE ${op.tbl} SET ${op.col} = ? WHERE ${where(op.tbl)}`, [op.value ?? null, ...key]);
    db.exec('INSERT OR REPLACE INTO cell_clock (tbl, row_id, col, hlc) VALUES (?, ?, ?, ?)', [op.tbl, op.rowId, op.col, op.hlc]);
    touchFor(op.tbl, op.rowId);
    return 'applied';
  }

  // Local write: one HLC per call, one op per cell; always wins.
  const write = (tbl: string, rowId: string, cells: Record<string, unknown>) => tx(() => {
    const h = hlc.next();
    for (const [col, value] of Object.entries(cells)) applyCell({ hlc: h, deviceId, tbl, rowId, col, value, schemaVersion: SCHEMA_VERSION }, true);
  });
  const applyRemoteOp = (op: Op): ApplyResult => tx(() => { hlc.observe(op.hlc); return applyCell(op, false); });

  const getItem = (id: string) => db.query<Item>('SELECT * FROM items WHERE id = ?', [id])[0];
  const itemPatch = (id: string, patch: Partial<Item>) => write('items', id, { ...patch, updated_at: now() });

  const items = {
    get: getItem,
    create(partial: Partial<Item> & { type: ItemType }): Item {
      const { id = uuid(), ...rest } = partial;
      const t = now();
      const cells: Record<string, unknown> = { created_at: t, updated_at: t, created_by: deviceId, open_count: 0, ...rest };
      for (const k of Object.keys(cells)) if (cells[k] == null) delete cells[k];
      write('items', id, cells);
      return getItem(id)!;
    },
    update: (id: string, patch: Partial<Omit<Item, 'id' | 'created_at' | 'created_by'>>) => itemPatch(id, patch),
    list(o: ListOpts = {}): Item[] {
      const w = [o.view === 'trash' ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'];
      const p: unknown[] = [];
      if (o.view === 'pinned') w.push('pinned_at IS NOT NULL');
      if (o.type) { w.push('type = ?'); p.push(o.type); }
      const order = o.view === 'pinned' ? 'pinned_at DESC'
        : { saved: 'created_at DESC', modified: 'updated_at DESC', opened: 'opened_at IS NULL, opened_at DESC', title: 'title COLLATE NOCASE ASC' }[o.sort ?? 'saved'];
      return db.query<Item>(`SELECT * FROM items WHERE ${w.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, [...p, o.limit ?? 100, o.offset ?? 0]);
    },
    letGo: (id: string) => itemPatch(id, { deleted_at: now() }),
    restore: (id: string) => itemPatch(id, { deleted_at: null }),
    pin: (id: string) => tx(() => {
      const pinned = db.query<{ id: string }>('SELECT id FROM items WHERE pinned_at IS NOT NULL AND deleted_at IS NULL AND id != ? ORDER BY pinned_at ASC', [id]);
      for (const p of pinned.slice(0, Math.max(0, pinned.length - 4))) itemPatch(p.id, { pinned_at: null });
      itemPatch(id, { pinned_at: now() });
    }),
    unpin: (id: string) => itemPatch(id, { pinned_at: null }),
    opened: (id: string) => itemPatch(id, { opened_at: now(), open_count: (getItem(id)?.open_count ?? 0) + 1 }),
    resurfaced: (id: string) => itemPatch(id, { resurfaced_at: now() }),
    letGoFromResurface: (id: string) => itemPatch(id, { let_go_at: now(), deleted_at: now() }),
  };

  const tags = {
    of: (itemId: string) => db.query<{ tag: string }>('SELECT tag FROM tags WHERE item_id = ? AND deleted_at IS NULL ORDER BY tag', [itemId]).map((r) => r.tag),
    all: () => db.query<{ tag: string; count: number }>(
      'SELECT t.tag, COUNT(*) count FROM tags t JOIN items i ON i.id = t.item_id WHERE t.deleted_at IS NULL AND i.deleted_at IS NULL GROUP BY t.tag ORDER BY count DESC, t.tag'),
    add: (itemId: string, tag: string, source: Tag['source'] = 'user') => write('tags', `${itemId}|${tag}`, { source, deleted_at: null }),
    remove: (itemId: string, tag: string) => write('tags', `${itemId}|${tag}`, { deleted_at: now() }),
    set: (itemId: string, list: string[], source: Tag['source'] = 'user') => tx(() => {
      const cur = new Set(tags.of(itemId));
      const want = new Set(list);
      for (const t of cur) if (!want.has(t)) tags.remove(itemId, t);
      for (const t of want) if (!cur.has(t)) tags.add(itemId, t, source);
    }),
  };

  const spaces = {
    create(name: string, query: string | null = null): Space {
      const id = uuid();
      write('spaces', id, { name, query, sort: now() });
      return db.query<Space>('SELECT * FROM spaces WHERE id = ?', [id])[0]!;
    },
    rename: (id: string, name: string) => write('spaces', id, { name }),
    delete: (id: string) => write('spaces', id, { deleted_at: now() }),
    list: () => db.query<Space>('SELECT * FROM spaces WHERE deleted_at IS NULL ORDER BY sort, name'),
    addItem: (spaceId: string, itemId: string) => write('space_items', `${spaceId}|${itemId}`, { added_at: now(), deleted_at: null }),
    removeItem: (spaceId: string, itemId: string) => write('space_items', `${spaceId}|${itemId}`, { deleted_at: now() }),
    itemsOf: (spaceId: string) => db.query<Item>(
      'SELECT i.* FROM space_items s JOIN items i ON i.id = s.item_id WHERE s.space_id = ? AND s.deleted_at IS NULL AND i.deleted_at IS NULL ORDER BY s.added_at DESC', [spaceId]),
  };

  const files = {
    add: (row: Omit<FileRow, 'deleted_at'>) => { const { hash, ...cells } = row; write('files', hash, { ...cells, deleted_at: null }); },
    of: (itemId: string) => db.query<FileRow>('SELECT * FROM files WHERE item_id = ? AND deleted_at IS NULL', [itemId]),
    remove: (hash: string) => write('files', hash, { deleted_at: now() }),
  };

  // Local only, never replicated, so plain SQL and no ops.
  const jobs = {
    enqueue(itemId: string | null, kind: JobKind): string {
      const dup = db.query<{ id: string }>("SELECT id FROM jobs WHERE item_id IS ? AND kind = ? AND status IN ('pending','running')", [itemId, kind])[0];
      if (dup) return dup.id;
      const id = uuid();
      db.exec('INSERT INTO jobs (id, item_id, kind, created_at) VALUES (?, ?, ?, ?)', [id, itemId, kind, now()]);
      return id;
    },
    next: (at: number = now()): Job | undefined => db.transaction(() => {
      const j = db.query<Job>("SELECT * FROM jobs WHERE status = 'pending' AND (run_after IS NULL OR run_after <= ?) ORDER BY created_at LIMIT 1", [at])[0];
      if (j) db.exec("UPDATE jobs SET status = 'running' WHERE id = ?", [j.id]);
      return j ? { ...j, status: 'running' } : undefined;
    }),
    done: (id: string) => db.exec("UPDATE jobs SET status = 'done', error = NULL WHERE id = ?", [id]),
    // ponytail: gives up after 5 attempts regardless of kind; per-kind limits if a job type needs more
    fail: (id: string, error: string, backoffMs: number) => db.exec(
      "UPDATE jobs SET attempts = attempts + 1, error = ?, run_after = ?, status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END WHERE id = ?",
      [error, now() + backoffMs, id]),
    skip: (id: string) => db.exec("UPDATE jobs SET status = 'skipped' WHERE id = ?", [id]),
    reenqueueSkipped: (kind?: JobKind) => db.exec(`UPDATE jobs SET status = 'pending', run_after = NULL WHERE status = 'skipped'${kind ? ' AND kind = ?' : ''}`, kind ? [kind] : []),
    get: (id: string) => db.query<Job>('SELECT * FROM jobs WHERE id = ?', [id])[0],
  };

  // Re-run ops stored with applied = 0 (unknown column at the time); call after migrate().
  const reapplyDeferred = () => tx(() => {
    type Row = { seq: number; hlc: string; device_id: string; tbl: string; row_id: string; col: string; value: string; schema_version: number };
    for (const r of db.query<Row>('SELECT * FROM ops WHERE applied = 0 ORDER BY hlc')) {
      if (!TABLES[r.tbl]?.cols.includes(r.col)) continue;
      db.exec('DELETE FROM ops WHERE seq = ?', [r.seq]);
      applyCell({ hlc: r.hlc, deviceId: r.device_id, tbl: r.tbl, rowId: r.row_id, col: r.col, value: decodeValue(r.value), schemaVersion: r.schema_version }, false);
    }
  });

  return { items, tags, spaces, files, jobs, applyRemoteOp, reapplyDeferred, hlc, transaction: tx };
}
