import { memoryDb } from '../../helpers/db';
import { createDb } from '../../../src/db';
import { createSyncEngine } from '../../../src/sync';
import { masterKey } from '../../../src/crypto';
import { createMemoryAdapter, createSharedStore, type SharedStore, type StorageAdapter } from '../../../src/storage';
import { SCHEMA_VERSION } from '../../../src/model/migrations';
import type { FileStore } from '../../../src/platform';

export const ENTROPY = new Uint8Array(16).map((_, i) => i * 7 + 1);
export const KEYS = masterKey.deriveKeys(ENTROPY);
export const DAY = 86_400_000;

export function memFiles(): FileStore & { map: Map<string, Uint8Array> } {
  const map = new Map<string, Uint8Array>();
  return {
    map,
    async write(h, b) { map.set(h, b); },
    async read(h) { const b = map.get(h); if (!b) throw new Error(`no file ${h}`); return b; },
    async remove(h) { map.delete(h); },
    path: (h) => `/mem/${h}`,
  };
}

export function makeDevice(id: string, store: SharedStore, now: () => number, storage?: StorageAdapter) {
  const raw = memoryDb();
  const db = createDb({ db: raw, now, deviceId: id });
  const files = memFiles();
  const logs: string[] = [];
  const engine = createSyncEngine({
    db, sql: raw, storage: storage ?? createMemoryAdapter(store, { now }), keys: KEYS, deviceId: id, deviceName: `dev ${id}`,
    now, files, schemaVersion: SCHEMA_VERSION, log: (m) => logs.push(m),
  });
  return { id, raw, db, engine, files, logs, now };
}
export type Device = ReturnType<typeof makeDevice>;

export const REPLICATED = ['items', 'files', 'tags', 'spaces', 'space_items', 'cell_clock'] as const;
export function dump(d: Device): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of REPLICATED) {
    const rows = d.raw.query<Record<string, unknown>>(`SELECT * FROM ${t}`).map((r) => JSON.stringify(r, (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v)));
    out[t] = rows.sort().join('\n');
  }
  return out;
}
export { createSharedStore };
