import { useEffect, useState, type DependencyList } from 'react';
import { create } from 'zustand';
import type { EngramDb, Platform, Queue } from '@engram/core';
import type { Capture } from './capture';
import type { Secrets } from './secrets';
import type { SyncService } from './sync';

// The booted hub and the hooks that read it. Deliberately import-light (types only): the iOS share extension
// renders the overlay from this module with a lite hub, without pulling in sync, jobs or the on-device model.

export type Listener = () => void;

// The iOS share extension cannot read the app's keychain, so the app mirrors its device id next to the database.
export const DEVICE_ID_FILE = 'device-id';

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
  // iOS share extension wrote straight into the App Group database.
  drain(): Promise<void>;
  onDeviceReason?: string; // why "On this device" is not offered; undefined when it is
}

export function createEvents() {
  const listeners = new Set<Listener>();
  return {
    on: (cb: Listener) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    emit: () => { for (const cb of listeners) cb(); },
  };
}

// Boot once per process. Screens read it through useEngram(); non-React code through getEngram().
type Boot = { engram?: Engram; error?: Error };
const useBoot = create<Boot>(() => ({}));
let booting: Promise<void> | undefined;
export function bootWith(factory: () => Promise<Engram>): Promise<void> {
  return booting ??= factory()
    .then((engram) => useBoot.setState({ engram }))
    .catch((e) => useBoot.setState({ error: e instanceof Error ? e : new Error(String(e)) }));
}

export const getBoot = (): Boot => useBoot.getState();
export const useBootState = (): Boot => useBoot();

// Throws before boot; for code paths that only run once a root has rendered.
export function engram(): Engram {
  const { engram: e, error } = useBoot.getState();
  if (!e) throw error ?? new Error('engram not booted');
  return e;
}

// Runs `fn` now and again after every change event. Queries are synchronous (op-sqlite is JSI).
export function useLiveQuery<T>(fn: (engram: Engram) => T, deps: DependencyList): T | undefined {
  const { engram: e } = useBoot();
  const [value, setValue] = useState<T | undefined>(() => (e ? fn(e) : undefined));
  useEffect(() => {
    if (!e) return;
    setValue(fn(e));
    return e.events.on(() => setValue(fn(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e, ...deps]);
  return value;
}
