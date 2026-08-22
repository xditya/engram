import type { StorageAdapter } from './types';

export type WebDavOpts = { baseUrl: string; username: string; password: string; fetch?: typeof fetch; pageSize?: number };

const MANIFEST = 'manifest.json';

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const encodePath = (key: string) => key.split('/').map(encodeURIComponent).join('/');

export function createWebDavAdapter(opts: WebDavOpts): StorageAdapter {
  const f = opts.fetch ?? fetch;
  const base = opts.baseUrl.endsWith('/') ? opts.baseUrl : opts.baseUrl + '/';
  const basePath = new URL(base).pathname;
  const auth = 'Basic ' + b64(`${opts.username}:${opts.password}`);
  const pageSize = opts.pageSize ?? 1000;
  const createdDirs = new Set<string>();

  const req = (method: string, key: string, init: { headers?: Record<string, string>; body?: BodyInit } = {}) =>
    f(base + encodePath(key), { method, headers: { Authorization: auth, ...init.headers }, body: init.body });

  async function ensureDirs(key: string) {
    const parts = key.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (createdDirs.has(dir)) continue;
      const r = await req('MKCOL', dir + '/');
      // 405 = already exists; parents always exist because we walk top-down
      if (!r.ok && r.status !== 405) throw new Error(`webdav: MKCOL ${dir} -> ${r.status}`);
      createdDirs.add(dir);
    }
  }

  // href -> key relative to base, or null if outside base
  function hrefToKey(href: string): string | null {
    const path = decodeURIComponent(new URL(href, base).pathname);
    return path.startsWith(basePath) ? path.slice(basePath.length) : null;
  }

  async function putBytes(key: string, bytes: Uint8Array, cond: Record<string, string>) {
    await ensureDirs(key);
    return req('PUT', key, { headers: { ...cond, 'Content-Type': 'application/octet-stream' }, body: bytes as BodyInit });
  }

  async function etagOf(r: Response, key: string) {
    let etag = r.headers.get('etag');
    if (!etag) etag = (await req('HEAD', key)).headers.get('etag'); // some servers omit ETag on PUT
    if (!etag) throw new Error('webdav: server returned no ETag');
    return etag;
  }

  return {
    async putIfAbsent(key, bytes) {
      const r = await putBytes(key, bytes, { 'If-None-Match': '*' });
      if (r.status === 412) return 'exists';
      if (!r.ok) throw new Error(`webdav: PUT ${key} -> ${r.status}`);
      return 'created';
    },
    async get(key) {
      const r = await req('GET', key);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`webdav: GET ${key} -> ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
    async list(prefix, after) {
      // Depth 1 on the directory part of the prefix; subcollections come back as 'dir/' keys
      const dir = prefix.slice(0, prefix.lastIndexOf('/') + 1);
      const r = await req('PROPFIND', dir, { headers: { Depth: '1' } });
      if (r.status === 404) return { keys: [] };
      if (!r.ok) throw new Error(`webdav: PROPFIND ${dir} -> ${r.status}`);
      // ponytail: regex over the multistatus body; swap for a real XML walk if a server emits hrefs outside <d:href>
      const keys: string[] = [];
      for (const m of (await r.text()).matchAll(/<(?:\w+:)?href[^>]*>([^<]+)<\/(?:\w+:)?href>/gi)) {
        const key = hrefToKey(m[1]!.trim());
        if (key && key !== dir && key.startsWith(prefix) && (!after || key > after)) keys.push(key);
      }
      keys.sort();
      const page = keys.slice(0, pageSize);
      return keys.length > pageSize ? { keys: page, next: page[page.length - 1] } : { keys: page };
    },
    async delete(key) {
      const r = await req('DELETE', key);
      if (!r.ok && r.status !== 404) throw new Error(`webdav: DELETE ${key} -> ${r.status}`);
    },
    async putManifest(bytes, ifMatch) {
      const r = await putBytes(MANIFEST, bytes, ifMatch === null ? { 'If-None-Match': '*' } : { 'If-Match': ifMatch });
      if (r.status === 412) return 'conflict';
      if (!r.ok) throw new Error(`webdav: PUT manifest -> ${r.status}`);
      return { etag: await etagOf(r, MANIFEST) };
    },
    async getManifest() {
      const r = await req('GET', MANIFEST);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`webdav: GET manifest -> ${r.status}`);
      return { bytes: new Uint8Array(await r.arrayBuffer()), etag: await etagOf(r, MANIFEST) };
    },
  };
}
