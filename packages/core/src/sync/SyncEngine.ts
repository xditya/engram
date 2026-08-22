import type { Database, FileStore } from '../platform';
import type { StorageAdapter } from '../storage/types';
import type { EngramDb } from '../db';
import { decodeOps, encodeOps, decodeValue, encodeValue, toBase64, fromBase64 } from '../db/ops';
import {
  decodeManifest, encodeManifest, keyCheck, open, openChunks, openFromPeer, remoteKeyFor, seal, sealChunks, sealForPeer,
  verifyKeyCheck, type KdfOpts, type Manifest,
} from '../crypto';
import type { Op } from './types';
import { gc as runGc, TRASH_MS } from './gc';
import { importInbox } from './inbox';

export const STALE_MS = 180 * 86_400_000;
const MAX_OPS = 500;
const MAX_BYTES = 1 << 20;
export const TABLES = ['items', 'files', 'tags', 'spaces', 'space_items'] as const;

export type Cursors = Record<string, string>; // source device id -> last consumed op file key
// originals: fetch originals now (wifi) or only thumbs; originalsOffline: the user wants every original on this device regardless.
export type BlobPolicy = { originals: 'eager' | 'lazy'; originalsOffline: boolean };
export type SyncOpts = {
  db: EngramDb;
  sql: Database;
  storage: StorageAdapter;
  keys: { dataKey: Uint8Array; hmacKey: Uint8Array };
  deviceId: string;
  deviceName: string;
  now: () => number;
  files: FileStore;
  schemaVersion: number;
  log?: (msg: string) => void;
};
export type SyncEngine = ReturnType<typeof createSyncEngine>;
export type SyncCtx = {
  sql: Database; storage: StorageAdapter; keys: SyncOpts['keys']; deviceId: string; now: () => number; files: FileStore;
  log: (msg: string) => void; listAll: (prefix: string, after?: string) => Promise<string[]>;
  readManifest: () => Promise<{ m: Manifest; etag: string | null }>; remoteKey: (hash: string) => string;
};

const utf8 = new TextEncoder();
const text = new TextDecoder();
export const aad = (key: string) => utf8.encode(key); // every file is bound to its own name
// 'ops/<dev>/<hlc of the batch's last op>.enc' -> that hlc. Naming a batch after its last op makes the key unique,
// sortable in push order, and deterministic: a retry after a lost ack lands on the same key and gets 'exists'.
export const hlcOfKey = (key: string) => key.slice(key.lastIndexOf('/') + 1).replace(/\.enc$/, '');
export const dominates = (a: Cursors, b: Cursors) => Object.entries(b).every(([dev, k]) => (a[dev] ?? '') >= k);
export const isStale = (lastSeen: number, now: number) => now - lastSeen > STALE_MS;
export const cursorsOf = (m: Manifest, dev: string): Cursors => {
  try { return JSON.parse(m.devices[dev]?.lastBatch ?? '{}'); } catch { return {}; }
};
// Snapshot rows travel as JSON; blob cells (embedding) are wrapped like op values.
const ROW_REPLACER = (_k: string, v: unknown) => (v instanceof Uint8Array ? { $b64: toBase64(v) } : v);
const ROW_REVIVER = (_k: string, v: unknown) =>
  v && typeof v === 'object' && typeof (v as { $b64?: unknown }).$b64 === 'string' ? fromBase64((v as { $b64: string }).$b64) : v;

type OpRow = { seq: number; hlc: string; device_id: string; tbl: string; row_id: string; col: string; value: string; schema_version: number };
const rowToOp = (r: OpRow): Op =>
  ({ hlc: r.hlc, deviceId: r.device_id, tbl: r.tbl, rowId: r.row_id, col: r.col, value: decodeValue(r.value), schemaVersion: r.schema_version });

// Link offers are sealed under the code alone, so the joining device reads one before it has a master key.
const linkKey = (code: string) => `link/${code}.enc`;
export async function readLinkOffer(storage: StorageAdapter, code: string): Promise<Uint8Array | null> {
  const sealed = await storage.get(linkKey(code));
  if (!sealed) return null;
  const entropy = openFromPeer(code, sealed);
  await storage.delete(linkKey(code));
  return entropy;
}

export function createSyncEngine(o: SyncOpts) {
  const { db, sql, storage, keys, deviceId, now, files } = o;
  const log = o.log ?? (() => {});
  const dir = `ops/${deviceId}/`;

  const cursorsLocal = (): Cursors => {
    const out: Cursors = {};
    for (const r of sql.query<{ device_id: string; last_key: string }>('SELECT device_id, last_key FROM sync_cursor WHERE last_key IS NOT NULL')) out[r.device_id] = r.last_key;
    return out;
  };
  const setCursor = (dev: string, key: string) =>
    sql.exec('INSERT OR REPLACE INTO sync_cursor (device_id, last_key, last_hlc, last_seen) VALUES (?, ?, ?, ?)', [dev, key, hlcOfKey(key), now()]);

  async function readManifest(): Promise<{ m: Manifest; etag: string | null }> {
    const got = await storage.getManifest();
    if (!got) return { m: { schemaVersion: o.schemaVersion, devices: {}, keyCheck: keyCheck(keys.hmacKey) }, etag: null };
    const m = decodeManifest(keys.dataKey, got.bytes);
    if (!verifyKeyCheck(keys.hmacKey, m.keyCheck)) throw new Error('key mismatch: this store belongs to a different master key');
    return { m, etag: got.etag };
  }

  // ops.pushed: 0 = local, 2 = staged into the batch currently being uploaded, 1 = on the remote.
  // Staging before the upload makes a retry re-send exactly the same batch (same ops, same key).
  async function push(stagedOnly = false): Promise<number> {
    let n = 0;
    for (;;) {
      let batch = sql.query<OpRow>('SELECT * FROM ops WHERE pushed = 2 ORDER BY seq');
      if (!batch.length) {
        if (stagedOnly) return n;
        batch = sql.query<OpRow>('SELECT * FROM ops WHERE pushed = 0 ORDER BY seq LIMIT ?', [MAX_OPS]);
        if (!batch.length) return n;
        // ponytail: size cap by halving and re-encoding; ops are tiny except embeddings so this rarely loops
        while (encodeOps(batch.map(rowToOp)).length > MAX_BYTES && batch.length > 1) batch = batch.slice(0, Math.ceil(batch.length / 2));
        sql.exec(`UPDATE ops SET pushed = 2 WHERE seq IN (${batch.map((r) => r.seq).join(',')})`);
      }
      const key = `${dir}${batch[batch.length - 1]!.hlc}.enc`;
      // Each batch names its predecessor so a puller can tell "not visible yet" from "nothing more" (iCloud lists lag).
      const prev = cursorsLocal()[deviceId] ?? null;
      const payload = utf8.encode(`{"prev":${JSON.stringify(prev)},"ops":${text.decode(encodeOps(batch.map(rowToOp)))}}`);
      await storage.putIfAbsent(key, seal(keys.dataKey, payload, aad(key)));
      sql.transaction(() => {
        sql.exec('UPDATE ops SET pushed = 1 WHERE pushed = 2');
        setCursor(deviceId, key); // my own dir never needs pulling
      });
      n += batch.length;
    }
  }

  async function listAll(prefix: string, after?: string): Promise<string[]> {
    const out: string[] = [];
    for (;;) {
      const page = await storage.list(prefix, after);
      out.push(...page.keys.filter((k) => !k.endsWith('/')));
      if (!page.next) return out.sort();
      after = page.next;
    }
  }
  const quarantine = (key: string, dev: string, e: unknown) => {
    log(`sync: bad file ${key}: ${String(e)}`);
    sql.exec('INSERT OR IGNORE INTO sync_errors (key, device_id, reason, first_seen) VALUES (?, ?, ?, ?)', [key, dev, String((e as Error)?.message ?? e), now()]);
  };

  // Ops for rows this replica does not have (and whose batch does not create) wait in `ops` with applied = 0 until
  // their parent shows up: early when the creating device's file is not visible yet, forever when the row was purged.
  const { orphan, isCreate } = db;
  const applyOps = (ops: Op[]): number => {
    const creates = new Set(ops.filter(isCreate).map((o) => `${o.tbl}|${o.rowId}`));
    let n = 0;
    for (const op of ops) {
      if (orphan(op, creates)) {
        sql.exec('INSERT INTO ops (hlc, device_id, tbl, row_id, col, value, schema_version, pushed, applied) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)',
          [op.hlc, op.deviceId, op.tbl, op.rowId, op.col, encodeValue(op.value), op.schemaVersion]);
      } else { db.applyRemoteOp(op); n++; }
    }
    return n;
  };
  const retryOrphans = (): number => db.transaction(() => {
    let n = 0;
    for (const r of sql.query<OpRow>('SELECT * FROM ops WHERE applied = 0 ORDER BY hlc')) {
      const op = rowToOp(r);
      if (orphan(op, new Set())) continue;
      sql.exec('DELETE FROM ops WHERE seq = ?', [r.seq]);
      db.applyRemoteOp(op);
      n++;
    }
    return n;
  });

  async function pull(): Promise<number> {
    const { applied, gaps } = await pullOnce();
    // A gap whose predecessor the newest snapshot already covers means those files were pruned: this replica is
    // behind the snapshot (a device that wrote before its first sync) and must rebuild from it, then replay.
    if (!gaps.length || sql.query('SELECT 1 FROM ops WHERE pushed != 1 LIMIT 1').length) return applied;
    const snap = await newestSnapshot();
    if (!snap || !gaps.some((g) => (snap.cursors[g.dev] ?? '') >= g.prev)) return applied;
    log('sync: behind the newest snapshot, rebuilding');
    await bootstrapFromSnapshot(snap, true);
    return applied + (await pullOnce()).applied;
  }
  const readBatch = (key: string, bytes: Uint8Array): { prev: string | null; ops: Op[] } => {
    const b = JSON.parse(text.decode(open(keys.dataKey, bytes, aad(key)))) as { prev: string | null; ops: unknown[] };
    return { prev: b.prev, ops: decodeOps(utf8.encode(JSON.stringify(b.ops))) };
  };
  // Re-reads quarantined files. The cursor already moved past a bad ops file, so its ops are applied here; a bad
  // inbox card is re-read by the next pull once its error row is gone. Files that still fail keep their row.
  async function retryErrors(): Promise<number> {
    let n = 0;
    for (const r of sql.query<{ key: string }>('SELECT key FROM sync_errors')) {
      try {
        if (r.key.startsWith('ops/')) {
          const bytes = await storage.get(r.key);
          if (!bytes) continue;
          const { ops } = readBatch(r.key, bytes);
          db.transaction(() => { n += applyOps(ops); });
        }
        sql.exec('DELETE FROM sync_errors WHERE key = ?', [r.key]);
      } catch (e) { log(`sync: ${r.key} still bad: ${String(e)}`); }
    }
    return n;
  }
  async function pullOnce(): Promise<{ applied: number; gaps: { dev: string; prev: string }[] }> {
    const { m } = await readManifest();
    const devs = new Set(Object.keys(m.devices));
    for (const k of await listAll('ops/')) devs.add(k.slice(4, k.indexOf('/', 4)));
    const cur = cursorsLocal();
    const gaps: { dev: string; prev: string }[] = [];
    let applied = 0;
    for (const dev of devs) {
      for (const key of await listAll(`ops/${dev}/`, cur[dev])) {
        const bytes = await storage.get(key);
        if (!bytes) break; // listed but not downloadable yet; keep order, retry next cycle
        let ops: Op[] | null = null;
        let gap: string | null = null;
        try {
          const batch = readBatch(key, bytes);
          if (batch.prev && batch.prev > (cur[dev] ?? '')) gap = batch.prev; // its predecessor is not listed yet
          else ops = batch.ops;
        } catch (e) { quarantine(key, dev, e); }
        if (gap) { log(`sync: gap in ops/${dev}/ before ${key} (have ${cur[dev] ?? 'nothing'})`); gaps.push({ dev, prev: gap }); break; }
        db.transaction(() => {
          applied += applyOps(ops ?? []);
          setCursor(dev, key);
          cur[dev] = key;
        });
      }
    }
    applied += retryOrphans();
    applied += await importInbox({ db, sql, storage, keys, now, log, listAll, quarantine, remoteKey });
    return { applied, gaps };
  }

  const remoteKey = (hash: string) => { const rk = remoteKeyFor(keys.hmacKey, hash); return `blobs/${rk.slice(0, 2)}/${rk}`; };
  async function syncBlobs(policy: BlobPolicy = { originals: 'lazy', originalsOffline: false }): Promise<void> {
    for (const b of sql.query<{ hash: string }>("SELECT hash FROM blob_index WHERE state = 'local'")) {
      const key = remoteKey(b.hash);
      await storage.putIfAbsent(key, sealChunks(keys.dataKey, await files.read(b.hash), aad(key)));
      sql.exec("UPDATE blob_index SET state = 'both', remote_key = ? WHERE hash = ?", [key, b.hash]);
    }
    const roles = policy.originals === 'eager' || policy.originalsOffline ? "('thumb','poster','original','reader_html')" : "('thumb','poster')";
    const want = sql.query<{ hash: string }>(
      `SELECT DISTINCT f.hash FROM files f LEFT JOIN blob_index b ON b.hash = f.hash WHERE f.deleted_at IS NULL AND f.role IN ${roles} AND (b.hash IS NULL OR b.state = 'remote')`);
    for (const f of want) await fetchBlob(f.hash);
  }
  async function fetchBlob(hash: string): Promise<boolean> {
    const key = remoteKey(hash);
    const sealed = await storage.get(key);
    if (!sealed) return false;
    const plain = openChunks(keys.dataKey, sealed, aad(key));
    await files.write(hash, plain);
    sql.exec("INSERT OR REPLACE INTO blob_index (hash, remote_key, bytes, state) VALUES (?, ?, ?, 'both')", [hash, key, plain.length]);
    return true;
  }

  async function editManifest(edit: (m: Manifest) => void): Promise<Manifest> {
    for (let attempt = 0; ; attempt++) {
      const { m, etag } = await readManifest();
      edit(m);
      const r = await storage.putManifest(encodeManifest(keys.dataKey, m), etag);
      if (r !== 'conflict') return m;
      if (attempt) { log('sync: manifest conflict twice, skipping'); return m; }
    }
  }
  const updateManifest = () => editManifest((m) => {
    if (m.devices[deviceId]?.removed) return; // a removed device stays removed
    m.schemaVersion = Math.max(m.schemaVersion, o.schemaVersion);
    m.devices[deviceId] = { name: o.deviceName, lastSeen: now(), lastBatch: JSON.stringify(cursorsLocal()) };
  });
  // A removed device no longer holds GC back and is refused by sync(); its pushed ops stay and keep being consumed.
  // It still has the key: removal revokes the store, not the phrase.
  const removeDevice = async (dev: string) => {
    await editManifest((m) => { if (m.devices[dev]) m.devices[dev].removed = true; });
    sql.exec('INSERT INTO sync_cursor (device_id, stale) VALUES (?, 1) ON CONFLICT(device_id) DO UPDATE SET stale = 1', [dev]);
  };

  // ---- snapshots -------------------------------------------------------------
  type Snapshot = { hlc: string; cursors: Cursors; tables: Record<string, unknown[]> };
  // Returns null when a newer-or-equal snapshot already exists that covers more of some device's ops than this
  // replica has consumed: the newest snapshot must always cover everything older ones did, or pruning by it would
  // drop files a bootstrapping device still needs.
  async function snapshot(): Promise<string | null> {
    await push(); // a snapshot must only contain state that is also on the remote as ops
    const snap: Snapshot = { hlc: db.hlc.next(), cursors: cursorsLocal(), tables: {} };
    const prev = await newestSnapshot();
    if (prev && !dominates(snap.cursors, prev.cursors)) { log('sync: not caught up past the newest snapshot, skipping'); return null; }
    for (const t of [...TABLES, 'cell_clock']) snap.tables[t] = sql.query(`SELECT * FROM ${t}`);
    // parked orphan ops are consumed-but-unapplied state the cursors claim to cover, so they travel too
    snap.tables.ops = sql.query('SELECT hlc, device_id, tbl, row_id, col, value, schema_version, 1 pushed, 0 applied FROM ops WHERE applied = 0');
    const key = `snapshots/${deviceId}/${snap.hlc}.enc`;
    await storage.putIfAbsent(key, sealChunks(keys.dataKey, utf8.encode(JSON.stringify(snap, ROW_REPLACER)), aad(key)));
    return key;
  }
  const hlcOfSnap = (k: string) => k.slice(k.lastIndexOf('/') + 1);
  async function newestSnapshot(): Promise<(Snapshot & { key: string }) | null> {
    const key = (await listAll('snapshots/')).sort((a, b) => (hlcOfSnap(a) < hlcOfSnap(b) ? 1 : -1))[0];
    const bytes = key ? await storage.get(key) : null;
    if (!key || !bytes) return null;
    return { key, ...(JSON.parse(text.decode(openChunks(keys.dataKey, bytes, aad(key))), ROW_REVIVER) as Snapshot) };
  }
  const wipe = () => {
    for (const t of [...TABLES, 'cell_clock', 'cell_history', 'sync_cursor']) sql.exec(`DELETE FROM ${t}`);
    sql.exec("INSERT INTO items_fts(items_fts) VALUES ('delete-all')");
  };
  // Rebuilds local state from the newest snapshot (or from nothing when none exists); pull() then replays later ops.
  // replayLocalOps re-applies this replica's own pushed ops the snapshot does not cover (its own latest files may
  // not be listed yet); everything else is re-pulled from the remote after the snapshot's cursors.
  async function bootstrapFromSnapshot(snap?: (Snapshot & { key: string }) | null, replayLocalOps = false): Promise<string | null> {
    snap ??= await newestSnapshot();
    const replay = replayLocalOps
      ? sql.query<OpRow>('SELECT * FROM ops WHERE pushed = 1 AND applied = 1 AND device_id = ? AND hlc > ? ORDER BY seq', [deviceId, snap ? hlcOfKey(snap.cursors[deviceId] ?? '') : ''])
      : [];
    sql.transaction(() => {
      wipe();
      sql.exec('DELETE FROM ops WHERE pushed = 1 AND applied = 1'); // orphans stay parked
      if (!snap) { applyOps(replay.map(rowToOp)); retryOrphans(); return; }
      for (const [t, rows] of Object.entries(snap.tables)) for (const r of rows as Record<string, unknown>[]) {
        const cols = Object.keys(r);
        sql.exec(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, Object.values(r));
      }
      for (const [dev, k] of Object.entries(snap.cursors)) setCursor(dev, k);
      db.hlc.observe(snap.hlc);
      // the db module only refreshes FTS for rows it writes itself, so rebuild the index here (before any replay,
      // whose FTS bookkeeping assumes the existing rows are indexed)
      for (const r of sql.query<{ rowid: number; id: string; title: string; body: string; summary: string; ocr_text: string; domain: string }>('SELECT rowid, id, title, body, summary, ocr_text, domain FROM items')) {
        const tags = sql.query<{ tag: string }>('SELECT tag FROM tags WHERE item_id = ? AND deleted_at IS NULL ORDER BY tag', [r.id]).map((t) => t.tag).join(' ');
        sql.exec('INSERT INTO items_fts(rowid, title, body, summary, ocr_text, tags, domain) VALUES (?, ?, ?, ?, ?, ?, ?)', [r.rowid, r.title ?? '', r.body ?? '', r.summary ?? '', r.ocr_text ?? '', tags, r.domain ?? '']);
      }
      applyOps(replay.map(rowToOp));
      retryOrphans();
    });
    return snap?.key ?? null;
  }

  // A device silent past the stale window may hold rows everyone else has purged. It finishes any batch that may
  // already be on the remote, rebuilds from the newest snapshot, catches up, then re-applies its unpushed ops on top:
  // ops for rows the rebuilt state does not have are dropped (the row was purged; they are parked as orphans and never
  // pushed), the rest are pushed as usual. The same rebuild serves a replica whose op files were pruned.
  // The rebuilt state may still carry a tombstone that others were entitled to purge (the snapshot predates the purge
  // and the op files replayed it): an unpushed op on a tombstone past the trash window is just as late as one on a
  // purged row, so it is dropped too; otherwise an old restore would resurrect the row on every other device.
  const expired = (tbl: string, rowId: string): boolean => {
    const bar = rowId.indexOf('|');
    const dead = (t: string, id: string) => sql.query(`SELECT 1 FROM ${t} WHERE id = ? AND deleted_at < ?`, [id, now() - TRASH_MS]).length > 0;
    if (tbl === 'items' || tbl === 'spaces') return dead(tbl, rowId);
    if (tbl === 'tags') return dead('items', rowId.slice(0, bar));
    if (tbl === 'space_items') return dead('spaces', rowId.slice(0, bar)) || dead('items', rowId.slice(bar + 1));
    return false;
  };
  async function rebootstrap(): Promise<void> {
    await push(true);
    const unpushed = sql.query<OpRow>('SELECT * FROM ops WHERE pushed != 1 ORDER BY seq');
    await bootstrapFromSnapshot(undefined, true);
    await pull();
    db.transaction(() => {
      sql.exec('DELETE FROM ops WHERE pushed != 1');
      const mine = unpushed.filter((r) => !expired(r.tbl, r.row_id));
      applyOps(mine.map(rowToOp));
      if (mine.length) sql.exec(`UPDATE ops SET pushed = 0 WHERE applied = 1 AND device_id = ? AND hlc IN (${mine.map(() => '?').join(',')})`, [deviceId, ...mine.map((r) => r.hlc)]);
    });
    await push();
    log('sync: replica rebuilt from the newest snapshot');
  }

  // ---- link --------------------------------------------------------------------
  const writeLinkOffer = async (code: string, entropy: Uint8Array, kdf?: KdfOpts) => {
    await storage.putIfAbsent(linkKey(code), sealForPeer(code, entropy, kdf));
  };

  // ---- top level -----------------------------------------------------------------
  type SyncResult = { pushed: number; applied: number; rebootstrapped: boolean };
  let inflight: Promise<SyncResult> | null = null;
  const sync = (policy?: BlobPolicy): Promise<SyncResult> => inflight ??= (async () => {
    try {
      let rebootstrapped = false;
      const me = (await readManifest()).m.devices[deviceId];
      if (me?.removed) throw new Error('this device was removed from the store');
      if (me && isStale(me.lastSeen, now())) { await rebootstrap(); rebootstrapped = true; }
      const pushed = await push();
      const applied = await pull();
      await syncBlobs(policy);
      await updateManifest();
      return { pushed, applied, rebootstrapped };
    } finally { inflight = null; }
  })();

  const ctx: SyncCtx = { sql, storage, keys, deviceId, now, files, log, listAll, readManifest, remoteKey };
  return {
    sync, push, pull, syncBlobs, fetchBlob, updateManifest, removeDevice, retryErrors, snapshot, bootstrapFromSnapshot, rebootstrap,
    gc: () => runGc(ctx), writeLinkOffer, readLinkOffer: (code: string) => readLinkOffer(storage, code), deviceId,
  };
}
