import type { StorageAdapter } from './types';

type Obj = { bytes: Uint8Array; visibleAt: number };
export type SharedStore = { objects: Map<string, Obj>; manifest: { bytes: Uint8Array; etag: string } | null; etagSeq: number };

export function createSharedStore(): SharedStore {
  return { objects: new Map(), manifest: null, etagSeq: 0 };
}

export type MemoryOpts = {
  delayVisibilityMs?: number; // keys show up in list() only after this long (iCloud-style lag)
  now?: () => number;
  failPut?: (key: string) => boolean; // chaos: throw on this put
  pageSize?: number;
};

export function createMemoryAdapter(store: SharedStore = createSharedStore(), opts: MemoryOpts = {}): StorageAdapter {
  const now = opts.now ?? Date.now;
  const delay = opts.delayVisibilityMs ?? 0;
  const pageSize = opts.pageSize ?? 1000;
  return {
    async putIfAbsent(key, bytes) {
      if (opts.failPut?.(key)) throw new Error(`memory: injected put failure for ${key}`);
      // check-and-set with no await in between, so concurrent callers see exactly one 'created'
      if (store.objects.has(key)) return 'exists';
      store.objects.set(key, { bytes: bytes.slice(), visibleAt: now() + delay });
      return 'created';
    },
    async get(key) {
      return store.objects.get(key)?.bytes.slice() ?? null;
    },
    async list(prefix, after) {
      const t = now();
      // ponytail: full scan + sort per call, fine for thousands of keys; index by prefix if the fuzz tests get slow
      const keys = [...store.objects]
        .filter(([k, o]) => k.startsWith(prefix) && o.visibleAt <= t && (!after || k > after))
        .map(([k]) => k)
        .sort();
      const page = keys.slice(0, pageSize);
      return keys.length > pageSize ? { keys: page, next: page[page.length - 1] } : { keys: page };
    },
    async delete(key) {
      store.objects.delete(key);
    },
    async putManifest(bytes, ifMatch) {
      if ((store.manifest?.etag ?? null) !== ifMatch) return 'conflict';
      const etag = String(++store.etagSeq);
      store.manifest = { bytes: bytes.slice(), etag };
      return { etag };
    },
    async getManifest() {
      return store.manifest ? { bytes: store.manifest.bytes.slice(), etag: store.manifest.etag } : null;
    },
  };
}
