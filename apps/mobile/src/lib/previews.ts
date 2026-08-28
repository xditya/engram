import { File } from 'expo-file-system';
import type { Engram } from './engram';

// Cards can end up without their preview: imported links never ran extract, a restore brought the file rows but
// not the bytes, or the og:image download failed once. This finds both kinds and sets them going again.
// Cheap enough to run at startup and after every sync; the extract queue does the slow part in the background.
const NO_PREVIEW_TYPES = "('link','article','product','book','recipe','tweet','repo','pdf','video')";
const BATCH = 300;

let last = 0;

export async function repairPreviews(e: Engram, opts: { force?: boolean; all?: boolean } = {}): Promise<{ extract: number; blobs: number; ocr: number }> {
  if (!opts.force && Date.now() - last < 10 * 60 * 1000) return { extract: 0, blobs: 0, ocr: 0 };
  last = Date.now();
  const sql = e.platform.db;

  // all: throw every link preview away and fetch each one again, whatever state it is in.
  if (opts.all) {
    const links = sql.query<{ id: string }>(`SELECT id FROM items WHERE deleted_at IS NULL AND url IS NOT NULL AND type IN ${NO_PREVIEW_TYPES}`);
    e.db.transaction(() => {
      for (const { id } of links) {
        for (const f of e.db.files.of(id)) if (f.role === 'thumb' || f.role === 'poster') e.db.files.remove(f.hash);
        sql.exec("DELETE FROM jobs WHERE item_id = ? AND kind IN ('extract','thumb','ocr','colors')", [id]);
      }
    });
    for (const { id } of links) e.queue.enqueueFor(id, ['extract']);
    if (links.length) { void e.drain(); e.events.emit(); }
    return { extract: links.length, blobs: 0, ocr: 0 };
  }

  // 1. Links with a url and no image row that this device never extracted (imports, restores) or failed on.
  //    A finished extract that found no image is left alone; the page simply has none.
  const bare = sql.query<{ id: string }>(
    `SELECT id FROM items WHERE deleted_at IS NULL AND url IS NOT NULL AND type IN ${NO_PREVIEW_TYPES}
       AND id NOT IN (SELECT item_id FROM files WHERE deleted_at IS NULL AND role IN ('thumb','poster','original'))
       AND id NOT IN (SELECT item_id FROM jobs WHERE kind = 'extract' AND status IN ('pending','running','done','skipped'))
     ORDER BY created_at DESC LIMIT ${BATCH}`,
  );
  for (const { id } of bare) e.queue.enqueueFor(id, ['extract']);

  // 2. Image rows whose bytes are not on this device: mark them remote so the next blob sync pulls them.
  const rows = sql.query<{ hash: string }>("SELECT DISTINCT hash FROM files WHERE deleted_at IS NULL AND role IN ('thumb','poster')");
  const missing = rows.filter((r) => { try { return !new File(e.platform.files.path(r.hash)).exists; } catch { return true; } });
  if (missing.length) {
    const ph = missing.map(() => '?').join(',');
    sql.exec(`UPDATE blob_index SET state = 'remote' WHERE hash IN (${ph}) AND state IN ('both','local')`, missing.map((m) => m.hash));
    const engine = await e.sync.getEngine().catch(() => null);
    if (engine) await engine.syncBlobs({ originals: 'lazy', originalsOffline: false }).catch(() => { /* offline: next sync retries */ });
    // Still not here (no sync set up, or the cloud never had it): a link can fetch its preview again instead of
    // showing an empty frame forever. Drop the dead rows so the card counts as bare and extract runs.
    const still = missing.filter((m) => { try { return !new File(e.platform.files.path(m.hash)).exists; } catch { return true; } });
    if (still.length) {
      const dead = sql.query<{ item_id: string; hash: string }>(
        `SELECT f.item_id, f.hash FROM files f JOIN items i ON i.id = f.item_id WHERE f.hash IN (${still.map(() => '?').join(',')}) AND f.deleted_at IS NULL AND i.url IS NOT NULL AND i.type IN ${NO_PREVIEW_TYPES}`,
        still.map((m) => m.hash));
      e.db.transaction(() => { for (const d of dead) { e.db.files.remove(d.hash); sql.exec("DELETE FROM jobs WHERE item_id = ? AND kind IN ('extract','thumb','ocr','colors')", [d.item_id]); } });
      for (const id of new Set(dead.map((d) => d.item_id))) { e.queue.enqueueFor(id, ['extract']); bare.push({ id }); }
    }
  }

  // 3. Preview images saved before OCR ran on links: read them once so on-image text becomes searchable.
  const unread = sql.query<{ id: string }>(
    `SELECT id FROM items WHERE deleted_at IS NULL AND ocr_text IS NULL
       AND id IN (SELECT item_id FROM files WHERE deleted_at IS NULL AND role IN ('thumb','poster','original'))
       AND id NOT IN (SELECT item_id FROM jobs WHERE kind = 'ocr')
     ORDER BY created_at DESC LIMIT ${BATCH}`,
  );
  for (const { id } of unread) e.queue.enqueueFor(id, ['ocr', 'autotag']);

  if (bare.length || unread.length) void e.drain();
  if (bare.length || missing.length) e.events.emit();
  return { extract: bare.length, blobs: missing.length, ocr: unread.length };
}
