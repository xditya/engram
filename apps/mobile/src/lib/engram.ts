import { AppState, Platform as RN } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as Network from 'expo-network';
import { db as coreDb, migrate, type Platform } from '@engram/core';
import { createFileStore, createOpSqliteDatabase, createSecureKeyStore, dataDir, fetchText, thumbnail } from '@engram/db-rn';
import { ocr } from '../platform/ocr';
import { createOnDevice, onDeviceUnavailableReason } from '../platform/onDevice';
import { createCapture } from './capture';
import { createJobs } from './jobs';
import { repairPreviews } from './previews';
import { createSecrets } from './secrets';
import { getSettings, useSettings } from './settings';
import { createSyncService } from './sync';
import { bootWith, createEvents, DEVICE_ID_FILE, getBoot, useBootState, type Engram } from './hub';

export type { Capture, CaptureOpts, ShareIntentLike } from './capture';
export type { SyncService, SyncState, SyncStatus } from './sync';
export type { Secrets } from './secrets';
export { useSyncStatus } from './sync';
export { useSettings, getSettings, type Settings } from './settings';
export { useToast } from './toast';
export { engram, useLiveQuery, type Engram } from './hub';


export async function createEngram(): Promise<Engram> {
  const events = createEvents();
  const keys = createSecureKeyStore();
  const dir = dataDir();
  let deviceId = await keys.get('deviceId');
  if (!deviceId) { deviceId = randomUUID(); await keys.set('deviceId', deviceId); }
  if (RN.OS === 'ios') try { new File(dir, DEVICE_ID_FILE).write(deviceId); } catch { /* the extension falls back to its own id */ }
  const secrets = createSecrets(keys);
  await secrets.load();

  const onDeviceReason = onDeviceUnavailableReason();
  const platform: Platform = {
    db: createOpSqliteDatabase(dir),
    keys,
    files: createFileStore(dir),
    fetchText,
    thumbnail,
    ocr,
    onDevice: onDeviceReason ? undefined : createOnDevice(),
    net: {
      onChange(cb) {
        if (RN.OS === 'web') return () => {};
        const sub = Network.addNetworkStateListener((s) => cb(!!s.isConnected && s.isInternetReachable !== false));
        return () => sub.remove();
      },
    },
    now: Date.now,
    deviceId,
  };
  migrate(platform.db, platform.now);
  const db = coreDb.createDb(platform, { onChange: events.emit });
  db.reapplyDeferred();

  const queue = createJobs({ platform, db, secrets, onDevice: platform.onDevice });
  let draining: Promise<void> | null = null;
  let wake: ReturnType<typeof setTimeout> | undefined;
  const drain = (): Promise<void> => draining ??= (async () => {
    try { while ((await queue.tick()) > 0) { /* until idle */ } } finally {
      draining = null;
      // Backed-off jobs come back by themselves instead of waiting for the next foreground.
      const at = queue.nextRunAt();
      clearTimeout(wake);
      if (at != null) wake = setTimeout(() => void drain(), Math.max(1000, at - platform.now()));
    }
  })();

  // Load the on-device model (downloading it on first use) only on Wi-Fi; jobs skip until it is loaded.
  const loadOnDevice = async () => {
    const od = platform.onDevice;
    if (!od || od.loaded || getSettings().intelligence.mode !== 'on-device' || RN.OS === 'web') return;
    if ((await Network.getNetworkStateAsync().catch(() => null))?.type !== Network.NetworkStateType.WIFI) return;
    if (await od.ready()) { queue.reenqueueSkipped(); void drain(); }
  };

  // After a sync, restored file rows may still lack bytes and pulled links may lack previews; repair before draining.
  const sync = createSyncService({ platform, db, secrets, afterSync: async () => { await repairPreviews(api).catch(() => {}); await drain(); } });
  const capture = createCapture({ platform, db, queue, sql: platform.db, drain });

  // Sync triggers: local writes (debounced 5 s), connectivity, foreground, background task.
  const syncOn = () => getSettings().sync.backend !== 'off';
  let t: ReturnType<typeof setTimeout> | undefined;
  events.on(() => { if (!syncOn()) return; clearTimeout(t); t = setTimeout(() => void sync.syncNow(), 5000); });
  platform.net.onChange((online) => { if (!online) return; void drain(); void loadOnDevice(); if (syncOn()) void sync.syncNow(); });
  AppState.addEventListener('change', (s) => { if (s === 'active') { void drain(); if (syncOn()) void sync.syncNow(); } });
  useSettings.subscribe((s, prev) => { if (s.sync !== prev.sync) { sync.reset(); if (s.sync.backend !== 'off') void sync.syncNow(); } });
  useSettings.subscribe((s, prev) => { if (s.intelligence.mode !== prev.intelligence.mode) void loadOnDevice(); });
  void sync.registerBackground();
  // Cards that never got a tag (saved before tagging existed, or whose run found nothing) get one more pass each boot.
  for (const { id } of platform.db.query<{ id: string }>(
    "SELECT i.id FROM items i WHERE i.deleted_at IS NULL AND i.created_by = ? AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.item_id = i.id AND t.deleted_at IS NULL) LIMIT 200",
    [deviceId],
  )) queue.enqueueFor(id, ['autotag']);
  void drain();
  void loadOnDevice();
  setTimeout(() => { void repairPreviews(api).catch(() => {}); }, 3000);

  const api = { platform, db, queue, capture, sync, secrets, deviceId, events, drain, onDeviceReason };
  return api;
}

// Boot once, app-wide. Screens read it through useEngram(); non-React code through getEngram().
export const boot = (): Promise<void> => bootWith(createEngram);
export function getEngram() { void boot(); return getBoot(); }
export function useEngram() { void boot(); return useBootState(); }
