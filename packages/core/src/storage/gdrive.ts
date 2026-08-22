import type { StorageAdapter } from './types';

// Drive appDataFolder is flat, so keys are stored as file names with '/' replaced by '__'
// (ops/dev1/000123-abc.bin -> ops__dev1__000123-abc.bin). Keys therefore must not contain '__'.
export type GDriveOpts = { getAccessToken(): Promise<string>; fetch?: typeof fetch; pageSize?: number };

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const MANIFEST = 'manifest.json';

export const keyToName = (key: string) => key.replaceAll('/', '__');
export const nameToKey = (name: string) => name.replaceAll('__', '/');
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

type File = { id: string; name: string };

export function createGDriveAdapter(opts: GDriveOpts): StorageAdapter {
  const f = opts.fetch ?? fetch;
  const pageSize = opts.pageSize ?? 1000;

  async function req(url: string, init: { method?: string; headers?: Record<string, string>; body?: BodyInit } = {}) {
    const token = await opts.getAccessToken();
    return f(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  }

  async function listFiles(query: string, pageToken?: string): Promise<{ files: File[]; next?: string }> {
    const p = new URLSearchParams({
      spaces: 'appDataFolder', q: `${query} and trashed=false`, fields: 'nextPageToken,files(id,name)', pageSize: String(pageSize),
    });
    if (pageToken) p.set('pageToken', pageToken);
    const r = await req(`${API}?${p}`);
    if (!r.ok) throw new Error(`gdrive: list -> ${r.status}`);
    const j = (await r.json()) as { files?: File[]; nextPageToken?: string };
    return { files: j.files ?? [], next: j.nextPageToken };
  }

  // ponytail: Drive create is not atomic, so two racing creators can both succeed; the lowest id is canonical,
  // the duplicate is ignored by get() and removed by delete(). Keys are unique per device/batch, so this is rare.
  async function find(name: string): Promise<File | null> {
    const { files } = await listFiles(`name='${q(name)}'`);
    return files.sort((a, b) => (a.id < b.id ? -1 : 1))[0] ?? null;
  }

  function multipart(name: string, bytes: Uint8Array) {
    const boundary = 'engram-' + Math.random().toString(36).slice(2);
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ['appDataFolder'] })}\r\n` +
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    );
    const tail = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.length + bytes.length + tail.length);
    body.set(head); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
    return { body, type: `multipart/related; boundary=${boundary}` };
  }

  async function create(name: string, bytes: Uint8Array) {
    const { body, type } = multipart(name, bytes);
    const r = await req(`${UPLOAD}?uploadType=multipart`, { method: 'POST', headers: { 'Content-Type': type }, body: body as BodyInit });
    if (!r.ok) throw new Error(`gdrive: create ${name} -> ${r.status}`);
    return r;
  }

  async function download(id: string) {
    const r = await req(`${API}/${id}?alt=media`);
    if (!r.ok) throw new Error(`gdrive: get ${id} -> ${r.status}`);
    return r;
  }

  return {
    async putIfAbsent(key, bytes) {
      const name = keyToName(key);
      if (await find(name)) return 'exists';
      await create(name, bytes);
      return 'created';
    },
    async get(key) {
      const file = await find(keyToName(key));
      return file ? new Uint8Array(await (await download(file.id)).arrayBuffer()) : null;
    },
    async list(prefix, after) {
      // Drive's `name contains` is prefix-match on names; re-check client-side anyway. `after` is Drive's pageToken.
      const { files, next } = await listFiles(`name contains '${q(keyToName(prefix))}'`, after);
      const keys = files.map((x) => nameToKey(x.name)).filter((k) => k.startsWith(prefix)).sort();
      return next ? { keys, next } : { keys };
    },
    async delete(key) {
      const { files } = await listFiles(`name='${q(keyToName(key))}'`);
      for (const file of files) {
        const r = await req(`${API}/${file.id}`, { method: 'DELETE' });
        if (!r.ok && r.status !== 404) throw new Error(`gdrive: delete ${key} -> ${r.status}`);
      }
    },
    async putManifest(bytes, ifMatch) {
      const file = await find(MANIFEST);
      if (ifMatch === null) {
        if (file) return 'conflict';
        return { etag: (await create(MANIFEST, bytes)).headers.get('etag') ?? '' };
      }
      if (!file) return 'conflict';
      const r = await req(`${UPLOAD}/${file.id}?uploadType=media`, {
        method: 'PATCH', headers: { 'If-Match': ifMatch, 'Content-Type': 'application/octet-stream' }, body: bytes as BodyInit,
      });
      if (r.status === 412) return 'conflict';
      if (!r.ok) throw new Error(`gdrive: update manifest -> ${r.status}`);
      return { etag: r.headers.get('etag') ?? '' };
    },
    async getManifest() {
      const file = await find(MANIFEST);
      if (!file) return null;
      const r = await download(file.id);
      return { bytes: new Uint8Array(await r.arrayBuffer()), etag: r.headers.get('etag') ?? '' };
    },
  };
}
