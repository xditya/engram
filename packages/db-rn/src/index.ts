// React Native implementations of the core Platform pieces. Native-only: the web app uses db-web.
import type { Database, FileStore, KeyStore } from '@engram/core';
import { open, type Scalar } from '@op-engineering/op-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as SecureStore from 'expo-secure-store';
import { Platform as RN } from 'react-native';

export { createICloudAdapter } from './icloud';

export const APP_GROUP = 'group.app.engram';

// Where the database and files live. iOS: the App Group container, so the share extension writes into the
// same database. Android: app-private documents (the share intent runs in the main process).
export function dataDir(): string {
  if (RN.OS === 'ios') {
    const shared = Paths.appleSharedContainers[APP_GROUP];
    if (shared) return shared.uri;
  }
  return Paths.document.uri;
}

const stripFileScheme = (uri: string) => uri.replace(/^file:\/\//, '').replace(/\/$/, '');
const toParams = (params?: unknown[]): Scalar[] | undefined =>
  params?.map((p) => (p === undefined ? null : p) as Scalar);
// op-sqlite hands BLOB columns back as ArrayBuffer; core expects Uint8Array (embedding cells).
const fixRow = (row: Record<string, Scalar>) => {
  for (const k in row) if (row[k] instanceof ArrayBuffer) row[k] = new Uint8Array(row[k] as ArrayBuffer);
  return row;
};

export function createOpSqliteDatabase(dir: string, name = 'engram.db'): Database {
  const db = open({ name, location: stripFileScheme(dir) });
  db.executeSync('PRAGMA journal_mode = WAL');
  db.executeSync('PRAGMA busy_timeout = 5000'); // the share extension holds short write locks
  db.executeSync('PRAGMA synchronous = NORMAL');
  let depth = 0;
  return {
    exec: (sql, params) => { db.executeSync(sql, toParams(params)); },
    query: <T>(sql: string, params?: unknown[]) => db.executeSync(sql, toParams(params)).rows.map(fixRow) as T[],
    transaction<T>(fn: () => T): T {
      if (depth > 0) return fn(); // nested: join the outer transaction, like better-sqlite3
      depth++;
      db.executeSync('BEGIN');
      try { const out = fn(); db.executeSync('COMMIT'); return out; }
      catch (e) { db.executeSync('ROLLBACK'); throw e; }
      finally { depth--; }
    },
  };
}

export function createSecureKeyStore(): KeyStore {
  const opts = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  return {
    get: (name) => SecureStore.getItemAsync(name, opts),
    set: (name, value) => SecureStore.setItemAsync(name, value, opts),
    delete: (name) => SecureStore.deleteItemAsync(name, opts),
  };
}

// Content-addressed files under <dir>/files/<hash>. Write goes to a .tmp sibling then moves, so a crash
// mid-write never leaves a truncated file under a hash that claims to be complete.
export function createFileStore(dir: string): FileStore {
  const root = new Directory(dir, 'files');
  const ensure = () => { if (!root.exists) root.create({ intermediates: true, idempotent: true }); };
  const fileFor = (hash: string) => new File(root, hash);
  return {
    async write(hash, bytes) {
      ensure();
      const f = fileFor(hash);
      if (f.exists) return;
      const tmp = new File(root, `${hash}.tmp`);
      if (tmp.exists) tmp.delete();
      tmp.write(bytes);
      tmp.moveSync(f);
    },
    async read(hash) {
      const f = fileFor(hash);
      if (!f.exists) throw new Error(`file missing: ${hash}`);
      return f.bytes();
    },
    async remove(hash) { const f = fileFor(hash); if (f.exists) f.delete(); },
    path: (hash) => fileFor(hash).uri,
  };
}

const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export async function fetchText(url: string, opts?: { maxBytes?: number }): Promise<{ html: string; finalUrl: string; contentType: string }> {
  const res = await fetch(url, { headers: { 'user-agent': DESKTOP_UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } });
  // ponytail: RN fetch has no streaming body, so the whole response lands in memory before the slice.
  // Fine for pages; the extractors only ever want html.
  const html = (await res.text()).slice(0, opts?.maxBytes ?? 2_000_000);
  return { html, finalUrl: res.url || url, contentType: res.headers.get('content-type') ?? '' };
}

// Longest side <= maxPx, JPEG q0.8, written to the cache dir. Caller hashes and moves it into the FileStore.
export async function thumbnail(path: string, maxPx: number): Promise<{ path: string; w: number; h: number }> {
  const ctx = ImageManipulator.manipulate(path);
  const probe = await ctx.renderAsync();
  const landscape = probe.width >= probe.height;
  const sized = Math.max(probe.width, probe.height) > maxPx
    ? await ctx.resize(landscape ? { width: maxPx } : { height: maxPx }).renderAsync()
    : probe;
  const out = await sized.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { path: out.uri, w: out.width, h: out.height };
}

// ponytail: no RGBA decode on native without a native module (expo-image-manipulator only re-encodes), so
// palette + blurhash are skipped on the phone: readRgba resolves null and the colors job is a no-op.
// TODO: tiny Expo Module (UIImage/Bitmap -> RGBA bytes) when the grid needs blurhash placeholders.
export async function readRgba(_path: string, _maxPx: number): Promise<{ rgba: Uint8Array; w: number; h: number } | null> {
  return null;
}
