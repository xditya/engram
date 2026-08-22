import { Platform as RN } from 'react-native';
import { create } from 'zustand';
import * as Network from 'expo-network';
import {
  SCHEMA_VERSION, crypto, storage, sync as coreSync, type EngramDb, type Platform, type StorageAdapter, type SyncEngine,
} from '@engram/core';
import { googleAccessToken } from './auth';
import { getSettings, type SyncBackend } from './settings';
import type { Secrets } from './secrets';

export type SyncState = 'off' | 'upToDate' | 'syncing' | 'unreachable' | 'full';
export type SyncStatus = { state: SyncState; at: number | null; error?: string };
export const useSyncStatus = create<SyncStatus>(() => ({ state: getSettings().sync.backend === 'off' ? 'off' : 'upToDate', at: null }));

export type SyncService = ReturnType<typeof createSyncService>;
const BG_TASK = 'engram-sync';

// The background task body must be registered at module scope; it reaches the live service through this slot.
let backgroundRun: (() => Promise<void>) | undefined;
if (RN.OS !== 'web') {
  const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
  const { BackgroundTaskResult } = require('expo-background-task') as typeof import('expo-background-task');
  TaskManager.defineTask(BG_TASK, async () => {
    try { await backgroundRun?.(); return BackgroundTaskResult.Success; } catch { return BackgroundTaskResult.Failed; }
  });
}

export function createSyncService(o: { platform: Platform; db: EngramDb; secrets: Secrets; afterSync: () => Promise<void> }) {
  const { platform, db, secrets } = o;
  let engine: SyncEngine | null = null;
  let builtFor = '';

  async function adapter(backend: SyncBackend): Promise<StorageAdapter | null> {
    const s = getSettings().sync;
    if (backend === 'gdrive') return storage.createGDriveAdapter({ getAccessToken: () => googleAccessToken(platform.keys) });
    if (backend === 'webdav' && s.webdav) {
      const password = secrets.get('webdavPassword');
      return password == null ? null : storage.createWebDavAdapter({ ...s.webdav, password });
    }
    if (backend === 'icloud' && RN.OS === 'ios') return (require('@engram/db-rn') as typeof import('@engram/db-rn')).createICloudAdapter();
    return null;
  }

  const masterKey = {
    get: () => secrets.master.get(),
    // First sync setup: mint the key and hand back the 12 words to show once.
    async ensure(): Promise<Uint8Array> {
      const cur = await secrets.master.get();
      if (cur) return cur;
      const entropy = crypto.masterKey.generate();
      await secrets.master.set(entropy);
      return entropy;
    },
    phrase: async (): Promise<string | null> => { const e = await secrets.master.get(); return e ? crypto.masterKey.toPhrase(e) : null; },
    async restore(phrase: string) { await secrets.master.set(crypto.masterKey.fromPhrase(phrase)); engine = null; },
    async clear() { await secrets.master.clear(); engine = null; },
  };

  // Built lazily from settings; rebuilt when sync settings change. null = sync off or not set up yet.
  async function getEngine(): Promise<SyncEngine | null> {
    const s = getSettings().sync;
    if (s.backend === 'off') return null;
    const entropy = await secrets.master.get();
    if (!entropy) return null;
    const sig = JSON.stringify(s);
    if (engine && builtFor === sig) return engine;
    const st = await adapter(s.backend);
    if (!st) return null;
    engine = coreSync.createSyncEngine({
      db, sql: platform.db, storage: st, keys: crypto.masterKey.deriveKeys(entropy), deviceId: platform.deviceId,
      deviceName: s.deviceName, now: platform.now, files: platform.files, schemaVersion: SCHEMA_VERSION, log: (m) => console.log(m),
    });
    builtFor = sig;
    return engine;
  }

  let running: Promise<void> | null = null;
  const syncNow = (): Promise<void> => running ??= (async () => {
    try {
      const e = await getEngine();
      if (!e) { useSyncStatus.setState({ state: 'off' }); return; }
      useSyncStatus.setState({ state: 'syncing', error: undefined });
      const onWifi = (await Network.getNetworkStateAsync().catch(() => null))?.type === Network.NetworkStateType.WIFI;
      await e.sync({ originals: onWifi ? 'eager' : 'lazy' });
      useSyncStatus.setState({ state: 'upToDate', at: platform.now(), error: undefined });
      await o.afterSync();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      // ponytail: "full" is sniffed from the message; adapters throw plain Errors with the HTTP status in them.
      useSyncStatus.setState({ state: /quota|full|507|insufficient/i.test(error) ? 'full' : 'unreachable', error });
    } finally { running = null; }
  })();

  async function registerBackground() {
    if (RN.OS === 'web') return;
    const Bg = require('expo-background-task') as typeof import('expo-background-task');
    backgroundRun = async () => { await syncNow(); await o.afterSync(); };
    try { await Bg.registerTaskAsync(BG_TASK, { minimumInterval: 15 }); } catch { /* background tasks restricted on this device */ }
  }

  return { getEngine, syncNow, masterKey, registerBackground, reset: () => { engine = null; }, status: useSyncStatus };
}
