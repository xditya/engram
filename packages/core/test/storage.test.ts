import { describe, expect, it } from 'vitest';
import { createGDriveAdapter, createMemoryAdapter, createSharedStore, createWebDavAdapter } from '../src/storage';

const b = (s: string) => new TextEncoder().encode(s);
const s = (u: Uint8Array | null) => (u ? new TextDecoder().decode(u) : null);

type Rec = { method: string; url: string; headers: Record<string, string>; body: string };
type Route = (r: Rec) => Response | undefined;
function fakeFetch(route: Route) {
  const calls: Rec[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? new TextDecoder().decode(init.body as Uint8Array) : '';
    const rec: Rec = { method: init?.method ?? 'GET', url: String(url), headers: (init?.headers ?? {}) as Record<string, string>, body };
    calls.push(rec);
    return route(rec) ?? new Response(null, { status: 404 });
  };
  return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
}

describe('memory adapter', () => {
  it('put/get/list/delete with paging', async () => {
    const a = createMemoryAdapter(undefined, { pageSize: 2 });
    for (const k of ['ops/d1/3', 'ops/d1/1', 'ops/d1/2', 'ops/d2/1']) expect(await a.putIfAbsent(k, b(k))).toBe('created');
    expect(await a.putIfAbsent('ops/d1/1', b('x'))).toBe('exists');
    expect(s(await a.get('ops/d1/1'))).toBe('ops/d1/1');
    expect(await a.get('nope')).toBeNull();
    const p1 = await a.list('ops/d1/');
    expect(p1).toEqual({ keys: ['ops/d1/1', 'ops/d1/2'], next: 'ops/d1/2' });
    expect(await a.list('ops/d1/', p1.next)).toEqual({ keys: ['ops/d1/3'] });
    await a.delete('ops/d1/2');
    await a.delete('ops/d1/2');
    expect((await a.list('ops/d1/')).keys).toEqual(['ops/d1/1', 'ops/d1/3']);
  });

  it('shared store: N adapters, one remote; delayed visibility; putIfAbsent race', async () => {
    let t = 1000;
    const store = createSharedStore();
    const d1 = createMemoryAdapter(store, { delayVisibilityMs: 500, now: () => t });
    const d2 = createMemoryAdapter(store, { now: () => t });
    const results = await Promise.all([d1.putIfAbsent('k', b('a')), d2.putIfAbsent('k', b('b'))]);
    expect(results.filter((r) => r === 'created')).toHaveLength(1);
    expect(s(await d2.get('k'))).toBe('a');
    expect((await d2.list('')).keys).toEqual([]); // d1 wrote it with lag
    t += 500;
    expect((await d2.list('')).keys).toEqual(['k']);
    expect(() => createMemoryAdapter(store, { failPut: (k) => k === 'boom' }).putIfAbsent('boom', b(''))).rejects.toThrow();
  });

  it('manifest etags', async () => {
    const a = createMemoryAdapter();
    expect(await a.getManifest()).toBeNull();
    expect(await a.putManifest(b('m1'), 'stale')).toBe('conflict');
    const r1 = await a.putManifest(b('m1'), null);
    expect(r1).not.toBe('conflict');
    const etag = (r1 as { etag: string }).etag;
    expect(await a.putManifest(b('m2'), null)).toBe('conflict');
    expect(await a.putManifest(b('m2'), etag)).not.toBe('conflict');
    expect(await a.putManifest(b('m3'), etag)).toBe('conflict');
    expect(s((await a.getManifest())!.bytes)).toBe('m2');
  });
});

describe('webdav adapter', () => {
  const base = 'https://dav.example.com/remote.php/dav/files/u/engram/';
  const multistatus = (hrefs: string[]) =>
    `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${hrefs.map((h) => `<d:response><d:href>${h}</d:href></d:response>`).join('')}</d:multistatus>`;

  it('putIfAbsent: MKCOL parents once, If-None-Match, 412 -> exists', async () => {
    const existing = new Set(['ops/d1/2']);
    const { calls, fetch } = fakeFetch((r) => {
      if (r.method === 'MKCOL') return new Response(null, { status: r.url.endsWith('/ops/') ? 405 : 201 });
      if (r.method === 'PUT') return new Response(null, { status: existing.has(r.url.slice(base.length)) ? 412 : 201 });
      return undefined;
    });
    const a = createWebDavAdapter({ baseUrl: base, username: 'u', password: 'pä', fetch });
    expect(await a.putIfAbsent('ops/d1/1', b('x'))).toBe('created');
    expect(await a.putIfAbsent('ops/d1/2', b('x'))).toBe('exists');
    expect(calls.map((c) => `${c.method} ${c.url.slice(base.length)}`)).toEqual(['MKCOL ops/', 'MKCOL ops/d1/', 'PUT ops/d1/1', 'PUT ops/d1/2']);
    expect(calls[2]!.headers).toMatchObject({ 'If-None-Match': '*', Authorization: 'Basic ' + btoa('u:p\xc3\xa4') });
    expect(calls[2]!.body).toBe('x');
  });

  it('get/delete/list with encoded hrefs and paging', async () => {
    const { calls, fetch } = fakeFetch((r) => {
      if (r.method === 'GET') return r.url.endsWith('/a%20b') ? new Response(b('hello')) : undefined;
      if (r.method === 'DELETE') return new Response(null, { status: 204 });
      if (r.method === 'PROPFIND')
        return new Response(multistatus([
          '/remote.php/dav/files/u/engram/ops/d1/', '/remote.php/dav/files/u/engram/ops/d1/c', base + 'ops/d1/a%20b',
          '/remote.php/dav/files/u/engram/ops/d1/b', '/remote.php/dav/files/u/engram/ops/d1/sub/',
        ]), { status: 207 });
      return undefined;
    });
    const a = createWebDavAdapter({ baseUrl: base, username: 'u', password: 'p', fetch, pageSize: 2 });
    expect(s(await a.get('ops/d1/a b'))).toBe('hello');
    expect(await a.get('missing')).toBeNull();
    await a.delete('x');
    const p1 = await a.list('ops/d1/');
    expect(calls.at(-1)).toMatchObject({ method: 'PROPFIND', url: base + 'ops/d1/', headers: { Depth: '1' } });
    expect(p1).toEqual({ keys: ['ops/d1/a b', 'ops/d1/b'], next: 'ops/d1/b' });
    expect(await a.list('ops/d1/', p1.next)).toEqual({ keys: ['ops/d1/c', 'ops/d1/sub/'] });
    expect(await a.list('ops/d1/s')).toEqual({ keys: ['ops/d1/sub/'] });
  });

  it('manifest: If-None-Match when null, If-Match otherwise, 412 -> conflict, HEAD fallback for etag', async () => {
    let etag = '"v1"';
    const { calls, fetch } = fakeFetch((r) => {
      if (r.method === 'MKCOL') return new Response(null, { status: 201 });
      if (r.method === 'PUT') {
        const ok = r.headers['If-None-Match'] ? etag === '' : r.headers['If-Match'] === etag;
        if (!ok) return new Response(null, { status: 412 });
        etag = `"v${Number(etag.slice(2, -1) || 0) + 1}"`;
        return new Response(null, { status: 204 }); // no ETag header on purpose
      }
      if (r.method === 'HEAD') return new Response(null, { headers: { etag } });
      if (r.method === 'GET') return new Response(b('m'), { headers: { etag } });
      return undefined;
    });
    const a = createWebDavAdapter({ baseUrl: base, username: 'u', password: 'p', fetch });
    expect(await a.putManifest(b('m'), null)).toBe('conflict');
    expect(await a.putManifest(b('m'), '"v0"')).toBe('conflict');
    expect(await a.putManifest(b('m'), '"v1"')).toEqual({ etag: '"v2"' });
    expect(calls.filter((c) => c.method === 'HEAD')).toHaveLength(1);
    expect(calls.filter((c) => c.method === 'MKCOL')).toHaveLength(0);
    expect(await a.getManifest()).toEqual({ bytes: b('m'), etag: '"v2"' });
  });
});

describe('gdrive adapter', () => {
  const files = new Map<string, { id: string; name: string; body: string; etag: string }>();
  let nextId = 1;
  const { calls, fetch } = fakeFetch((r) => {
    const u = new URL(r.url);
    if (r.method === 'GET' && u.pathname === '/drive/v3/files') {
      const q = u.searchParams.get('q')!;
      const m = /name(=| contains )'((?:[^'\\]|\\.)*)'/.exec(q)!;
      const needle = m[2]!.replace(/\\(.)/g, '$1');
      let hits = [...files.values()].filter((f) => (m[1] === '=' ? f.name === needle : f.name.startsWith(needle)));
      const tok = u.searchParams.get('pageToken');
      if (tok) hits = hits.slice(Number(tok));
      const page = hits.slice(0, 2);
      const out: Record<string, unknown> = { files: page.map(({ id, name }) => ({ id, name })) };
      if (hits.length > 2) out.nextPageToken = String(Number(tok ?? 0) + 2);
      return Response.json(out);
    }
    if (r.method === 'POST' && u.pathname === '/upload/drive/v3/files') {
      const name = JSON.parse(/\r\n\r\n(\{.*?\})\r\n/.exec(r.body)![1]!).name as string;
      const body = r.body.split('\r\n\r\n')[2]!.split('\r\n--')[0]!;
      const id = `id${String(nextId++).padStart(3, '0')}`;
      files.set(id, { id, name, body, etag: `"e${id}-1"` });
      return Response.json({ id }, { headers: { etag: `"e${id}-1"` } });
    }
    const mm = /\/files\/(\w+)$/.exec(u.pathname);
    const f = mm && files.get(mm[1]!);
    if (!f) return undefined;
    if (r.method === 'GET') return new Response(b(f.body), { headers: { etag: f.etag } });
    if (r.method === 'DELETE') { files.delete(f.id); return new Response(null, { status: 204 }); }
    if (r.method === 'PATCH') {
      if (r.headers['If-Match'] !== f.etag) return new Response(null, { status: 412 });
      f.body = r.body; f.etag = f.etag.replace(/-(\d+)"$/, (_, n) => `-${Number(n) + 1}"`);
      return Response.json({ id: f.id }, { headers: { etag: f.etag } });
    }
    return undefined;
  });
  const a = createGDriveAdapter({ getAccessToken: async () => 'tok', fetch, pageSize: 2 });

  it('putIfAbsent/get with flat names, multipart upload, bearer auth', async () => {
    expect(await a.putIfAbsent("ops/d1/it's", b('x'))).toBe('created');
    expect(await a.putIfAbsent("ops/d1/it's", b('y'))).toBe('exists');
    expect(s(await a.get("ops/d1/it's"))).toBe('x');
    expect(await a.get('ops/d1/nope')).toBeNull();
    const up = calls.find((c) => c.method === 'POST')!;
    expect(up.url).toBe('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
    expect(up.headers['Content-Type']).toMatch(/^multipart\/related; boundary=/);
    expect(up.headers.Authorization).toBe('Bearer tok');
    expect(up.body).toContain('"name":"ops__d1__it\'s","parents":["appDataFolder"]');
    const list = calls.find((c) => c.url.includes('/drive/v3/files?'))!;
    const p = new URL(list.url).searchParams;
    expect(p.get('spaces')).toBe('appDataFolder');
    expect(p.get('q')).toBe("name='ops__d1__it\\'s' and trashed=false");
  });

  it('list pages via nextPageToken and filters by prefix', async () => {
    for (const k of ['ops/d1/a', 'ops/d1/b', 'ops/d2/a', 'blobs/aa/x']) await a.putIfAbsent(k, b(k));
    const p1 = await a.list('ops/');
    expect(p1.keys).toEqual(['ops/d1/a', "ops/d1/it's"]);
    expect(p1.next).toBe('2');
    const p2 = await a.list('ops/', p1.next);
    expect(p2).toEqual({ keys: ['ops/d1/b', 'ops/d2/a'] });
    expect(await a.list('blobs/')).toEqual({ keys: ['blobs/aa/x'] });
  });

  it('duplicate names: lowest id canonical, delete removes all', async () => {
    files.set('id900', { id: 'id900', name: 'dup', body: 'late', etag: '"x"' });
    files.set('id100', { id: 'id100', name: 'dup', body: 'early', etag: '"x"' });
    expect(s(await a.get('dup'))).toBe('early');
    await a.delete('dup');
    await a.delete('dup');
    expect(await a.get('dup')).toBeNull();
  });

  it('manifest: create when null, PATCH with If-Match, 412 -> conflict', async () => {
    expect(await a.getManifest()).toBeNull();
    expect(await a.putManifest(b('m'), '"nope"')).toBe('conflict');
    const r1 = await a.putManifest(b('m1'), null);
    expect(r1).toEqual({ etag: expect.stringMatching(/^"eid\d+-1"$/) });
    expect(await a.putManifest(b('m2'), null)).toBe('conflict');
    const etag = (r1 as { etag: string }).etag;
    const r2 = await a.putManifest(b('m2'), etag);
    expect(r2).toEqual({ etag: etag.replace('-1"', '-2"') });
    expect(await a.putManifest(b('m3'), etag)).toBe('conflict');
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toMatch(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\/id\d+\?uploadType=media$/);
    expect(patch.headers['If-Match']).toBe(etag);
    const m = await a.getManifest();
    expect(s(m!.bytes)).toBe('m2');
    expect(m!.etag).toBe((r2 as { etag: string }).etag);
  });
});
