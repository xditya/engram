import { useEffect, useState, type DependencyList } from 'react';
import { randomUUID } from 'expo-crypto';
import { Paths } from 'expo-file-system';
import { migrate, type Platform } from '@engram/core';
import { createFileStore, createOpSqliteDatabase, createSecureKeyStore } from '@engram/db-rn';

type Listener = () => void;

export interface Engram {
  platform: Platform;
  events: { on(cb: Listener): () => void; emit(): void };
}

// The one Platform the app hands to core. Anything not yet implemented natively throws at call time,
// so the app still boots and the Library renders.
export function createEngram(): Engram {
  const listeners = new Set<Listener>();
  const events = {
    on: (cb: Listener) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    emit: () => { for (const cb of listeners) cb(); },
  };
  const platform: Platform = {
    db: createOpSqliteDatabase(Paths.document.uri + '/engram.db'),
    keys: createSecureKeyStore(),
    files: createFileStore(Paths.document.uri + '/files'),
    async fetchText(url, opts) {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      const html = (await res.text()).slice(0, opts?.maxBytes ?? 2_000_000);
      return { html, finalUrl: res.url || url, contentType: res.headers.get('content-type') ?? '' };
    },
    thumbnail: async () => { throw new Error('thumbnail: not implemented'); },
    // ponytail: no reachability yet; always "online". Wire expo-network when sync lands.
    net: { onChange: () => () => {} },
    now: Date.now,
    deviceId: randomUUID(),
  };
  migrate(platform.db, platform.now);
  return { platform, events };
}

let instance: Engram | undefined;
let bootError: Error | undefined;

export function getEngram(): { engram?: Engram; error?: Error } {
  if (!instance && !bootError) {
    try { instance = createEngram(); } catch (e) { bootError = e instanceof Error ? e : new Error(String(e)); }
  }
  return { engram: instance, error: bootError };
}

// Runs `fn` now and again after every 'change' event. Queries are synchronous (op-sqlite is JSI).
export function useLiveQuery<T>(fn: (engram: Engram) => T, deps: DependencyList): T | undefined {
  const { engram } = getEngram();
  const [value, setValue] = useState<T | undefined>(() => (engram ? fn(engram) : undefined));
  useEffect(() => {
    if (!engram) return;
    setValue(fn(engram));
    return engram.events.on(() => setValue(fn(engram)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
