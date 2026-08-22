import { useEffect, useState, type DependencyList } from 'react';
import { AppState, Platform as RN } from 'react-native';
import { create } from 'zustand';
import { randomUUID } from 'expo-crypto';
import * as Network from 'expo-network';
import { db as coreDb, migrate, type EngramDb, type Platform, type Queue } from '@engram/core';
import { createFileStore, createOpSqliteDatabase, createSecureKeyStore, dataDir, fetchText, thumbnail } from '@engram/db-rn';
import { ocr } from '../platform/ocr';
import { createOnDevice, onDeviceUnavailableReason } from '../platform/onDevice';
import { createCapture, type Capture } from './capture';
import { createJobs } from './jobs';
import { createSecrets, type Secrets } from './secrets';
import { getSettings, useSettings } from './settings';
import { createSyncService, type SyncService } from './sync';

export type { Capture, CaptureOpts, ShareIntentLike } from './capture';
export type { SyncService, SyncState, SyncStatus } from './sync';
export type { Secrets } from './secrets';
export { useSyncStatus } from './sync';
export { useSettings, getSettings, type Settings } from './settings';
export { useToast } from './toast';

type Listener = () => void;

export interface Engram {
  platform: Platform;
  db: EngramDb;
  queue: Queue;
  capture: Capture;
  sync: SyncService;
  secrets: Secrets;
  deviceId: string;
  events: { on(cb: Listener): () => void; emit(): void };
  // Runs queued jobs until none are pending (extract/thumb/ocr/classify/embed). Also what picks up rows the
  // iOS share target wrote straight into the App Group database.
  drain(): Promise<void>;
  onDeviceReason?: string; // why "On this device" is not offered; undefined when it is
}

export async function createEngram(): Promise<Engram> {
  const listeners = new Set<Listener>();
  const events = {
    on: (cb: Listener) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    emit: () => { for (const cb of listeners) cb(); },
  };
  const keys = createSecureKeyStore();
  const dir = dataDir();
  let deviceId = await keys.get('deviceId');
  if (!deviceId) { deviceId = randomUUID(); await keys.set('deviceId', deviceId); }
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
  const drain = (): Promise<void> => draining ??= (async () => {
    try { while ((await queue.tick()) > 0) { /* until idle */ } } finally { draining = null; }
  })();

  const sync = createSyncService({ platform, db, secrets, afterSync: drain });
  const capture = createCapture({ platform, db, queue, sql: platform.db, drain });

  // Sync triggers: local writes (debounced 5 s), connectivity, foreground, background task.
  const syncOn = () => getSettings().sync.backend !== 'off';
  let t: ReturnType<typeof setTimeout> | undefined;
  events.on(() => { if (!syncOn()) return; clearTimeout(t); t = setTimeout(() => void sync.syncNow(), 5000); });
  platform.net.onChange((online) => { if (online && syncOn()) void sync.syncNow(); });
  AppState.addEventListener('change', (s) => { if (s === 'active') { void drain(); if (syncOn()) void sync.syncNow(); } });
  useSettings.subscribe((s, prev) => { if (s.sync !== prev.sync) { sync.reset(); if (s.sync.backend !== 'off') void sync.syncNow(); } });
  void sync.registerBackground();
  void drain();

  return { platform, db, queue, capture, sync, secrets, deviceId, events, drain, onDeviceReason };
}

// Boot once, app-wide. Screens read it through useEngram(); non-React code through getEngram().
type Boot = { engram?: Engram; error?: Error };
const useBoot = create<Boot>(() => ({}));
let booting: Promise<void> | undefined;
export function boot(): Promise<void> {
  return booting ??= createEngram()
    .then((engram) => useBoot.setState({ engram }))
    .catch((e) => useBoot.setState({ error: e instanceof Error ? e : new Error(String(e)) }));
}

export function getEngram(): Boot { void boot(); return useBoot.getState(); }
export function useEngram(): Boot { void boot(); return useBoot(); }
// Throws before boot; for code paths that only run once the layout has rendered.
export function engram(): Engram {
  const { engram: e, error } = useBoot.getState();
  if (!e) throw error ?? new Error('engram not booted');
  return e;
}

// Runs `fn` now and again after every change event. Queries are synchronous (op-sqlite is JSI).
export function useLiveQuery<T>(fn: (engram: Engram) => T, deps: DependencyList): T | undefined {
  const { engram: e } = useEngram();
  const [value, setValue] = useState<T | undefined>(() => (e ? fn(e) : undefined));
  useEffect(() => {
    if (!e) return;
    setValue(fn(e));
    return e.events.on(() => setValue(fn(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e, ...deps]);
  return value;
}
