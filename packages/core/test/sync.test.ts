import { describe, expect, it } from 'vitest';
import { createSharedStore, DAY, dump, ENTROPY, KEYS, makeDevice } from './fixtures/sync/device';
import { createMemoryAdapter } from '../src/storage';
import { seal } from '../src/crypto';
import { createSyncEngine, normalizeUrl, readLinkOffer } from '../src/sync';
import { encodeOps } from '../src/db';

function world() {
  let t = 1_700_000_000_000;
  const store = createSharedStore();
  const now = () => t;
  const a = makeDevice('A', store, now), b = makeDevice('B', store, now);
  return { store, a, b, now, tick: (ms: number) => (t += ms), newDevice: (id: string) => makeDevice(id, store, now) };
}

describe('sync engine', () => {
  it('push/pull converges, is idempotent, and updates the manifest', async () => {
    const w = world();
    const it1 = w.a.db.items.create({ type: 'note', title: 'hello' });
    w.a.db.tags.add(it1.id, 'x');
    const r1 = await w.a.engine.sync();
    expect(r1.pushed).toBeGreaterThan(0);
    const r2 = await w.b.engine.sync();
    expect(r2.applied).toBe(r1.pushed);
    expect(w.b.db.items.get(it1.id)?.title).toBe('hello');
    expect(w.b.db.tags.of(it1.id)).toEqual(['x']);
    w.tick(1000);
    w.b.db.items.update(it1.id, { title: 'edited on B' });
    await w.b.engine.sync();
    await w.a.engine.sync();
    expect(w.a.db.items.get(it1.id)?.title).toBe('edited on B');
    expect((await w.a.engine.sync()).applied).toBe(0);
    expect(dump(w.a)).toEqual(dump(w.b));
    const m = await w.a.engine.updateManifest();
    expect(Object.keys(m.devices).sort()).toEqual(['A', 'B']);
    expect(w.a.raw.query('SELECT * FROM ops WHERE pushed != 1')).toHaveLength(0);
  });

  it('quarantines a corrupt file and keeps going', async () => {
    const w = world();
    w.a.db.items.create({ type: 'note', title: 'one' });
    await w.a.engine.push();
    const bad = `ops/A/0000000000000-0000-A.enc`;
    await w.store.objects.set(bad, { bytes: new Uint8Array([1, 2, 3]), visibleAt: 0 });
    w.tick(10);
    w.a.db.items.create({ type: 'note', title: 'two' });
    await w.a.engine.push();
    await w.b.engine.sync();
    expect(w.b.db.items.list().map((i) => i.title).sort()).toEqual(['one', 'two']);
    const errs = w.b.raw.query<{ key: string }>('SELECT key FROM sync_errors');
    expect(errs).toEqual([{ key: bad }]);
    await w.b.engine.sync();
    expect(w.b.raw.query('SELECT * FROM sync_errors')).toHaveLength(1);
    // retry: still bad keeps its row; once the file is good its ops land and the row goes
    expect(await w.b.engine.retryErrors()).toBe(0);
    expect(w.b.raw.query('SELECT * FROM sync_errors')).toHaveLength(1);
    const good = w.a.raw.query<{ hlc: string }>('SELECT hlc FROM ops ORDER BY seq LIMIT 1')[0]!.hlc;
    const wire = new TextDecoder().decode(encodeOps([{ hlc: good, deviceId: 'A', tbl: 'items', rowId: 'r', col: 'created_by', value: 'A', schemaVersion: 1 }, { hlc: good, deviceId: 'A', tbl: 'items', rowId: 'r', col: 'title', value: 'fixed', schemaVersion: 1 }]));
    const ops = new TextEncoder().encode(`{"prev":null,"ops":${wire}}`);
    await w.store.objects.set(bad, { bytes: seal(KEYS.dataKey, ops, new TextEncoder().encode(bad)), visibleAt: 0 });
    expect(await w.b.engine.retryErrors()).toBe(2);
    expect(w.b.db.items.get('r')?.title).toBe('fixed');
    expect(w.b.raw.query('SELECT * FROM sync_errors')).toHaveLength(0);
  });

  it('removeDevice: the device stops holding GC back and is refused by sync', async () => {
    const w = world();
    const c = w.newDevice('C');
    const it1 = w.a.db.items.create({ type: 'note', title: 'doomed' });
    for (const d of [w.a, w.b, c]) await d.engine.sync();
    w.tick(DAY);
    w.a.db.items.letGo(it1.id);
    await w.a.engine.sync();
    w.tick(31 * DAY);
    await w.a.engine.sync();
    await w.b.engine.sync();
    expect((await w.a.engine.gc()).purged).toBe(0); // C is live and behind
    await w.a.engine.removeDevice('C');
    expect((await w.a.engine.updateManifest()).devices.C?.removed).toBe(true);
    expect(w.a.raw.query("SELECT stale FROM sync_cursor WHERE device_id = 'C'")).toEqual([{ stale: 1 }]);
    expect((await w.a.engine.gc()).purged).toBeGreaterThan(0);
    await expect(c.engine.sync()).rejects.toThrow(/removed/);
  });

  it('a stale device returning with an old restore does not resurrect a row everyone else purged', async () => {
    const w = world();
    const c = w.newDevice('C');
    const it1 = w.a.db.items.create({ type: 'note', title: 'gone' });
    for (const d of [w.a, w.b, c]) await d.engine.sync();
    w.tick(DAY);
    w.a.db.items.letGo(it1.id);
    for (const d of [w.a, w.b, c]) await d.engine.sync();
    await c.engine.snapshot(); // predates the purge: the tombstone is in it
    w.tick(DAY);
    c.db.items.restore(it1.id); // never pushed: C goes dark
    w.tick(200 * DAY);
    for (const d of [w.a, w.b]) { await d.engine.sync(); await d.engine.sync(); }
    expect((await w.a.engine.gc()).purged).toBeGreaterThan(0);
    await w.b.engine.gc();
    expect((await c.engine.sync()).rebootstrapped).toBe(true);
    expect(c.db.items.get(it1.id)?.deleted_at ?? 'purged').not.toBeNull();
    for (const d of [w.a, w.b, c]) { await d.engine.sync(); await d.engine.gc(); }
    for (const d of [w.a, w.b, c]) expect(d.db.items.get(it1.id)).toBeUndefined();
    expect(dump(w.a)).toEqual(dump(c));
  });

  it('purges tombstones only after every live device is past them; stale devices do not block', async () => {
    const w = world();
    const c = w.newDevice('C');
    const it1 = w.a.db.items.create({ type: 'note', title: 'doomed' });
    for (const d of [w.a, w.b, c]) await d.engine.sync();
    w.tick(DAY);
    w.a.db.items.letGo(it1.id);
    await w.a.engine.sync();
    w.tick(31 * DAY);
    await w.a.engine.sync();
    expect((await w.a.engine.gc()).purged).toBe(0); // B never saw the delete
    await w.b.engine.sync();
    expect((await w.a.engine.gc()).purged).toBe(0); // B's cursor is in the manifest now, but C is still live and behind
    w.tick(150 * DAY); // C silent for 181 d -> stale; B and A stay fresh
    await w.b.engine.sync();
    await w.a.engine.sync();
    expect((await w.a.engine.gc()).purged).toBeGreaterThan(0);
    expect(w.a.db.items.get(it1.id)).toBeUndefined();
    expect(w.a.raw.query('SELECT * FROM cell_clock WHERE row_id = ?', [it1.id])).toHaveLength(0);
    await w.b.engine.gc();
    expect(dump(w.a)).toEqual(dump(w.b));
    expect(w.a.db.items.get(it1.id)).toBeUndefined();
  });

  it('stale device re-bootstraps from the snapshot and re-pushes its unpushed creates as new items', async () => {
    const w = world();
    const c = w.newDevice('C');
    const doomed = w.a.db.items.create({ type: 'note', title: 'doomed' });
    for (const d of [w.a, w.b, c]) await d.engine.sync();
    w.tick(DAY);
    const mine = c.db.items.create({ type: 'note', title: 'saved while away' }); // never pushed
    c.db.tags.add(mine.id, 'keep');
    w.a.db.items.letGo(doomed.id);
    await w.a.engine.sync();
    await w.b.engine.sync();
    w.tick(200 * DAY);
    await w.a.engine.sync();
    await w.b.engine.sync();
    expect((await w.a.engine.gc()).purged).toBeGreaterThan(0);
    await w.b.engine.gc();
    w.a.db.items.create({ type: 'note', title: 'later' });
    await w.a.engine.sync();
    const snap = await w.a.engine.snapshot();
    expect(snap?.startsWith('snapshots/A/')).toBe(true);
    const r = await c.engine.sync();
    expect(r.rebootstrapped).toBe(true);
    expect(c.db.items.get(doomed.id)).toBeUndefined();
    const re = c.db.items.get(mine.id)!;
    expect(re.created_by).toBe('C');
    expect(c.db.tags.of(re.id)).toEqual(['keep']);
    await w.a.engine.sync();
    await w.b.engine.sync();
    expect(w.a.db.items.list().map((i) => i.title).sort()).toEqual(['later', 'saved while away']);
    expect(dump(w.a)).toEqual(dump(c));
    expect(dump(w.a)).toEqual(dump(w.b));
    // op files older than the snapshot that everyone consumed are pruned
    await w.a.engine.sync();
    await w.b.engine.sync();
    await c.engine.sync();
    await w.a.engine.sync();
    expect((await w.a.engine.gc()).opFiles).toBeGreaterThan(0);
    const fresh = w.newDevice('D');
    await fresh.engine.bootstrapFromSnapshot();
    await fresh.engine.sync();
    expect(dump(fresh)).toEqual(dump(w.a));
  });

  it('link offer round trip', async () => {
    const w = world();
    await w.a.engine.writeLinkOffer('123456', ENTROPY, { t: 1, m: 256 });
    const keyless = createMemoryAdapter(w.store, { now: w.now }); // a joining device has storage but no master key yet
    expect(await readLinkOffer(keyless, '000000')).toBeNull();
    expect(await readLinkOffer(keyless, '123456')).toEqual(ENTROPY);
    expect(await w.b.engine.readLinkOffer('123456')).toBeNull(); // consumed
  });

  it('imports inbox cards once, dedups by url, and syncs blobs', async () => {
    const w = world();
    const card = (o: object) => new TextEncoder().encode(JSON.stringify(o));
    const put = async (id: string, o: object) => w.store.objects.set(`inbox/${id}.enc`, { bytes: seal(KEYS.dataKey, card(o), new TextEncoder().encode(`inbox/${id}.enc`)), visibleAt: 0 });
    await put('1', { url: 'https://www.Example.com/a/?utm_source=x#frag', title: 'A', quote: 'first' });
    await put('2', { url: 'https://example.com/a', quote: 'second', files: [{ hash: 'h1', role: 'thumb', mime: 'image/png' }] });
    await put('3', { url: 'https://example.com/a', quote: 'first' });
    await w.a.engine.sync();
    expect([...w.store.objects.keys()].filter((k) => k.startsWith('inbox/'))).toEqual([]);
    const items = w.a.db.items.list();
    expect(items).toHaveLength(1);
    expect(items[0]!.url).toBe('https://example.com/a');
    expect(items[0]!.body).toBe('first\n\nsecond');
    expect(items[0]!.created_by).toBe('A');
    expect(normalizeUrl('HTTPS://WWW.x.com/p?b=2&a=1&fbclid=9/')).toBe('https://x.com/p?a=1&b=2');
    // blob: B owns the thumb locally, uploads; A downloads it eagerly
    w.b.files.map.set('h1', new Uint8Array([9, 9, 9]));
    w.b.raw.exec("INSERT INTO blob_index (hash, bytes, state) VALUES ('h1', 3, 'local')");
    await w.b.engine.sync();
    expect([...w.store.objects.keys()].some((k) => k.startsWith('blobs/'))).toBe(true);
    await w.a.engine.sync();
    expect(w.a.files.map.get('h1')).toEqual(new Uint8Array([9, 9, 9]));
    expect(w.a.raw.query("SELECT state FROM blob_index WHERE hash = 'h1'")).toEqual([{ state: 'both' }]);
  });

  it('refuses a store sealed under another key', async () => {
    const w = world();
    await w.a.engine.sync();
    const z = makeDevice('Z', w.store, w.now);
    const e = createSyncEngine({ db: z.db, sql: z.raw, storage: createMemoryAdapter(w.store, { now: w.now }), keys: { dataKey: KEYS.dataKey, hmacKey: new Uint8Array(32) }, deviceId: 'Z', deviceName: 'z', now: w.now, files: z.files, schemaVersion: 1 });
    await expect(e.sync()).rejects.toThrow(/key mismatch/);
  });
});
