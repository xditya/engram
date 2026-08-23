import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { db as coreDb, migrate, type Platform } from '@engram/core';
import { APP_GROUP, createFileStore, createOpSqliteDatabase } from '@engram/db-rn';
import { createCapture } from './capture';
import { createEvents, DEVICE_ID_FILE, type Engram } from './hub';

// The hub the iOS share extension boots: the App Group database and file store plus the capture API, and
// nothing that ticks. Saves land as items + jobs + op-log rows; the app enriches and syncs them on its next
// foreground. The extension runs inside ~120 MB, so no queue, no sync engine, no models.
export async function createEngramLite(): Promise<Engram> {
  const container = Paths.appleSharedContainers[APP_GROUP];
  if (!container) throw new Error('App Group unavailable');
  const dir = container.uri;
  const events = createEvents();
  let deviceId: string | undefined;
  try { deviceId = new File(dir, DEVICE_ID_FILE).textSync().trim() || undefined; } catch { /* app never booted since the mirror was added */ }
  deviceId ??= randomUUID();
  const unused = () => Promise.reject(new Error('not in the share extension'));
  const platform: Platform = {
    db: createOpSqliteDatabase(dir),
    keys: { get: async () => null, set: async () => {}, delete: async () => {} },
    files: createFileStore(dir),
    fetchText: unused,
    thumbnail: unused,
    net: { onChange: () => () => {} },
    now: Date.now,
    deviceId,
  };
  migrate(platform.db, platform.now);
  const db = coreDb.createDb(platform, { onChange: events.emit });
  const drain = async () => {};
  // Same INSERT the app's queue does; the app's drain() picks the rows up.
  const queue = {
    enqueueFor(itemId: string, kinds: string[]) {
      const now = platform.now();
      platform.db.transaction(() => {
        for (const kind of kinds) {
          if (platform.db.query("SELECT 1 FROM jobs WHERE item_id=? AND kind=? AND status IN ('pending','running')", [itemId, kind]).length) continue;
          platform.db.exec("INSERT INTO jobs (id, item_id, kind, status, attempts, run_after, created_at) VALUES (?,?,?,'pending',0,?,?)", [`${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`, itemId, kind, now, now]);
        }
      });
    },
  };
  const capture = createCapture({ platform, db, queue, sql: platform.db, drain });
  // The overlay reads db / capture / platform / events only; sync and secrets never exist in this process.
  return { platform, db, capture, deviceId, events, drain } as unknown as Engram;
}
