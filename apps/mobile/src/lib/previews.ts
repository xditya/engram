import { File } from 'expo-file-system';
import type { Engram } from './engram';

// Cards can end up without their preview: imported links never ran extract, a restore brought the file rows but
// not the bytes, or the og:image download failed once. This finds both kinds and sets them going again.
// Cheap enough to run at startup and after every sync; the extract queue does the slow part in the background.
const NO_PREVIEW_TYPES = "('link','article','product','book','recipe','tweet','repo','pdf','video')";
const BATCH = 300;

let last = 0;

export async function repairPreviews(e: Engram, opts: { force?: boolean } = {}): Promise<{ extract: number; blobs: number }> {
  if (!opts.force && Date.now() - last < 10 * 60 * 1000) return { extract: 0, blobs: 0 };
  last = Date.now();
  const sql = e.platform.db;

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
  }

  if (bare.length) void e.drain();
  if (bare.length || missing.length) e.events.emit();
  return { extract: bare.length, blobs: missing.length };
}
