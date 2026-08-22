import { openChunks } from '../crypto';
import { aad, cursorsOf, dominates, hlcOfKey, isStale, TABLES, type Cursors, type SyncCtx } from './SyncEngine';

export const TRASH_MS = 30 * 86_400_000;
export const HISTORY_MS = 90 * 86_400_000;
const PK: Record<string, string[]> = { items: ['id'], files: ['hash'], tags: ['item_id', 'tag'], spaces: ['id'], space_items: ['space_id', 'item_id'] };
const text = new TextDecoder();

export type GcResult = { purged: number; blobs: number; opFiles: number };

// Everything here is opportunistic and idempotent: any device may run it, and running it twice changes nothing.
export async function gc(ctx: SyncCtx): Promise<GcResult> {
  const { sql, storage, keys, deviceId, now, files } = ctx;
  const { m } = await ctx.readManifest();
  const t = now();
  const live = Object.keys(m.devices).filter((d) => d !== deviceId && !isStale(m.devices[d]!.lastSeen, t));
  const cursors: Record<string, Cursors> = Object.fromEntries(live.map((d) => [d, cursorsOf(m, d)]));
  const mine: Cursors = {};
  for (const r of sql.query<{ device_id: string; last_key: string }>('SELECT device_id, last_key FROM sync_cursor WHERE last_key IS NOT NULL')) mine[r.device_id] = r.last_key;
  // A tombstone is safe to drop only when no device can still hand me an op that touches the row: I have consumed
  // everything anyone (stale devices included) has pushed, and every live device has seen the delete and last
  // synced after the trash window closed, so any later edit is UI-impossible and all it wrote before is on the remote.
  const caughtUp = Object.keys(m.devices).every((dev) => dev === deviceId || (cursorsOf(m, dev)[dev] ?? '') <= (mine[dev] ?? ''));
  const safe = (author: string, h: string, deletedAt: number) => caughtUp && live.every((dev) => {
    const c = cursors[dev]!;
    return (dev === author || hlcOfKey(c[author] ?? '') >= h) && m.devices[dev]!.lastSeen >= deletedAt + TRASH_MS;
  });

  // ---- tombstones: purge once every live device has seen the delete and the trash window is over ----
  let purged = 0;
  const purgeRow = (tbl: string, rowId: string) => {
    const key = PK[tbl]!.length === 1 ? [rowId] : [rowId.slice(0, rowId.indexOf('|')), rowId.slice(rowId.indexOf('|') + 1)];
    const where = PK[tbl]!.map((c) => `${c} = ?`).join(' AND ');
    if (tbl === 'items') {
      const r = sql.query<{ rowid: number; title: string; body: string; summary: string; ocr_text: string; domain: string }>('SELECT rowid, title, body, summary, ocr_text, domain FROM items WHERE id = ?', [rowId])[0];
      if (r) {
        const tags = sql.query<{ tag: string }>('SELECT tag FROM tags WHERE item_id = ? AND deleted_at IS NULL ORDER BY tag', [rowId]).map((x) => x.tag).join(' ');
        sql.exec("INSERT INTO items_fts(items_fts, rowid, title, body, summary, ocr_text, tags, domain) VALUES ('delete', ?, ?, ?, ?, ?, ?, ?)", [r.rowid, r.title ?? '', r.body ?? '', r.summary ?? '', r.ocr_text ?? '', tags, r.domain ?? '']);
      }
      for (const child of ['tags', 'space_items', 'files']) for (const c of sql.query<{ row_id: string }>(`SELECT ${child === 'space_items' ? "space_id || '|' || item_id" : child === 'tags' ? "item_id || '|' || tag" : 'hash'} row_id FROM ${child} WHERE item_id = ?`, [rowId])) purgeRow(child, c.row_id);
    }
    if (tbl === 'spaces') for (const c of sql.query<{ row_id: string }>("SELECT space_id || '|' || item_id row_id FROM space_items WHERE space_id = ?", [rowId])) purgeRow('space_items', c.row_id);
    sql.exec(`DELETE FROM ${tbl} WHERE ${where}`, key);
    for (const aux of ['cell_clock', 'cell_history']) sql.exec(`DELETE FROM ${aux} WHERE tbl = ? AND row_id = ?`, [tbl, rowId]);
    sql.exec('DELETE FROM ops WHERE tbl = ? AND row_id = ? AND pushed = 1', [tbl, rowId]);
    purged++;
  };
  sql.transaction(() => {
    for (const tbl of TABLES) {
      const rowExpr = PK[tbl]!.join(" || '|' || ");
      const dead = sql.query<{ row_id: string; hlc: string | null; deleted_at: number }>(
        `SELECT ${rowExpr} row_id, deleted_at, (SELECT hlc FROM cell_clock c WHERE c.tbl = ? AND c.row_id = ${rowExpr} AND c.col = 'deleted_at') hlc FROM ${tbl} WHERE deleted_at IS NOT NULL AND deleted_at < ?`,
        [tbl, t - TRASH_MS]);
      for (const d of dead) {
        if (!d.hlc) continue;
        const author = d.hlc.slice(19);
        const unpushed = sql.query<{ n: number }>('SELECT COUNT(*) n FROM ops WHERE pushed != 1 AND tbl = ? AND row_id = ?', [tbl, d.row_id])[0]!.n;
        if (!unpushed && safe(author, d.hlc, d.deleted_at)) purgeRow(tbl, d.row_id);
      }
    }
    sql.exec('DELETE FROM cell_history WHERE lost_at < ?', [t - HISTORY_MS]);
  });

  // ---- blobs: nothing references the hash any more (live rows gone, tombstones purged) ----
  let blobs = 0;
  for (const b of sql.query<{ hash: string; remote_key: string | null }>('SELECT hash, remote_key FROM blob_index WHERE hash NOT IN (SELECT hash FROM files)')) {
    if (b.remote_key) await storage.delete(b.remote_key);
    await files.remove(b.hash).catch(() => {});
    sql.exec('DELETE FROM blob_index WHERE hash = ?', [b.hash]);
    blobs++;
  }

  // ---- op files: gone once the newest snapshot contains them and every live device (and I) consumed them ----
  // ponytail: two devices snapshotting at the same moment can leave a newest snapshot that covers less than an older
  // one; pruning then waits until a later snapshot covers both, and the older file is kept meanwhile
  let opFiles = 0;
  const snaps = (await ctx.listAll('snapshots/')).sort((a, b) => (a.slice(a.lastIndexOf('/')) < b.slice(b.lastIndexOf('/')) ? 1 : -1));
  const read = async (key: string): Promise<Cursors | null> => {
    const bytes = await storage.get(key);
    return bytes ? (JSON.parse(text.decode(openChunks(keys.dataKey, bytes, aad(key)))) as { cursors: Cursors }).cursors : null;
  };
  const newest = snaps[0] ? await read(snaps[0]) : null;
  if (newest) {
    let covered = true;
    for (const old of snaps.slice(1)) {
      const c = await read(old);
      if (c && !dominates(newest, c)) { covered = false; continue; }
      await storage.delete(old);
    }
    if (covered) for (const key of await ctx.listAll('ops/')) {
      const dev = key.slice(4, key.indexOf('/', 4));
      const consumed = (c: Cursors | undefined, d: string) => d === dev || (c?.[dev] ?? '') >= key;
      if (consumed(newest, '') && consumed(mine, '') && live.every((d) => consumed(cursors[d], d))) { ctx.log(`gc: pruned ${key}`); await storage.delete(key); opFiles++; }
    }
  }
  return { purged, blobs, opFiles };
}
