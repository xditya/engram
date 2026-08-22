import { describe, expect, it } from 'vitest';
import { memoryDb } from './helpers/db';
import { createDb, makeHlc, compareHlc, parseHlc, encodeOps, decodeOps, traceStrength, resurfaceCandidates } from '../src/db';
import type { Op } from '../src/sync/types';

const DAY = 86_400_000;
function setup(deviceId = 'dev-a') {
  let t = 1_700_000_000_000;
  const raw = memoryDb();
  const changes: number[] = [];
  const db = createDb({ db: raw, now: () => t, deviceId }, { onChange: () => changes.push(t) });
  return { db, raw, changes, tick: (ms = 1000) => (t += ms), now: () => t };
}
const op = (o: Partial<Op> & { rowId: string; col: string; value: unknown }): Op =>
  ({ hlc: '9999999999999-0000-dev-b', deviceId: 'dev-b', tbl: 'items', schemaVersion: 1, ...o });

describe('hlc', () => {
  it('is monotonic, sortable, and clamps to what it has seen', () => {
    let t = 1000;
    const warns: number[] = [];
    const h = makeHlc('me', () => t, (a) => warns.push(a));
    const a = h.next(), b = h.next();
    expect(compareHlc(a, b)).toBe(-1);
    expect(parseHlc(b)).toEqual({ wall: 1000, counter: 1, deviceId: 'me' });
    h.observe('0000000005000-0003-other');
    t = 900; // local clock went backwards: still moves forward
    const c = h.next();
    expect(parseHlc(c)).toEqual({ wall: 5000, counter: 4, deviceId: 'me' });
    t = 5000 + 3_700_000;
    expect(compareHlc(h.next(), c)).toBe(1);
    expect(warns.length).toBe(1);
  });
});

describe('ops codec', () => {
  it('round-trips batches including binary values', () => {
    const ops = [op({ rowId: 'r', col: 'title', value: 'héllo' }), op({ rowId: 'r', col: 'embedding', value: new Uint8Array([1, 2, 255]) }), op({ rowId: 'r', col: 'x', value: null })];
    const back = decodeOps(encodeOps(ops));
    expect(back[0]).toEqual(ops[0]);
    expect(Array.from(back[1]!.value as Uint8Array)).toEqual([1, 2, 255]);
    expect(back[2]!.value).toBeNull();
  });
});

describe('items', () => {
  it('create -> list -> update writes ops rows and cell_clock, fires onChange per tx', () => {
    const { db, raw, changes, tick } = setup();
    const it1 = db.items.create({ type: 'note', title: 'First', body: 'hello world' });
    expect(it1.created_by).toBe('dev-a');
    tick();
    db.items.update(it1.id, { title: 'Second' });
    expect(db.items.list()[0]!.title).toBe('Second');
    const ops = raw.query<{ col: string; pushed: number; hlc: string }>('SELECT col, pushed, hlc FROM ops WHERE row_id = ? ORDER BY seq', [it1.id]);
    expect(ops.every((o) => o.pushed === 0)).toBe(true);
    expect(ops.map((o) => o.col)).toEqual(['created_at', 'updated_at', 'created_by', 'open_count', 'type', 'title', 'body', 'title', 'updated_at']);
    const clock = raw.query<{ hlc: string }>("SELECT hlc FROM cell_clock WHERE row_id = ? AND col = 'title'", [it1.id])[0]!.hlc;
    expect(clock).toBe(ops.at(-1)!.hlc);
    expect(changes.length).toBe(2);
    expect(db.items.list({ sort: 'title' }).map((i) => i.title)).toEqual(['Second']);
  });

  it('applyRemoteOp: older hlc loses into cell_history, newer wins and archives the old value', () => {
    const { db, raw } = setup();
    const it1 = db.items.create({ type: 'note', title: 'local' });
    expect(db.applyRemoteOp(op({ hlc: '0000000000001-0000-dev-b', rowId: it1.id, col: 'title', value: 'old' }))).toBe('lost');
    expect(db.items.get(it1.id)!.title).toBe('local');
    expect(raw.query<{ value: string }>("SELECT value FROM cell_history WHERE col = 'title'")).toEqual([{ value: '"old"' }]);
    expect(db.applyRemoteOp(op({ rowId: it1.id, col: 'title', value: 'remote' }))).toBe('applied');
    expect(db.items.get(it1.id)!.title).toBe('remote');
    expect(raw.query<{ value: string }>("SELECT value FROM cell_history WHERE col = 'title' ORDER BY rowid").map((r) => r.value)).toEqual(['"old"', '"local"']);
    // unknown column: parked with applied = 0
    expect(db.applyRemoteOp(op({ rowId: it1.id, col: 'mood', value: 1 }))).toBe('deferred');
    expect(raw.query('SELECT * FROM ops WHERE applied = 0').length).toBe(1);
    // unknown row is created with NOT NULL defaults
    db.applyRemoteOp(op({ rowId: 'new-row', col: 'title', value: 'from b' }));
    expect(db.items.get('new-row')).toMatchObject({ title: 'from b', type: 'note', created_by: 'dev-b', open_count: 0 });
    // remote ops are not in the outbox
    expect(raw.query("SELECT count(*) c FROM ops WHERE device_id = 'dev-b' AND pushed = 0")).toEqual([{ c: 0 }]);
  });

  it('tombstones: plain edits apply but do not resurrect; explicit null restores', () => {
    const { db, tick } = setup();
    const it1 = db.items.create({ type: 'note', title: 'x' });
    tick(); db.items.letGo(it1.id);
    expect(db.items.list().length).toBe(0);
    expect(db.items.list({ view: 'trash' }).length).toBe(1);
    db.applyRemoteOp(op({ rowId: it1.id, col: 'title', value: 'typo fixed' }));
    expect(db.items.get(it1.id)).toMatchObject({ title: 'typo fixed' });
    expect(db.items.get(it1.id)!.deleted_at).not.toBeNull();
    db.applyRemoteOp(op({ rowId: it1.id, col: 'deleted_at', value: null }));
    expect(db.items.list().length).toBe(1);
    tick(); db.items.letGoFromResurface(it1.id);
    expect(db.items.get(it1.id)!.let_go_at).not.toBeNull();
    tick(); db.items.restore(it1.id);
    expect(db.items.get(it1.id)!.deleted_at).toBeNull();
  });

  it('pin keeps at most 5, releasing the oldest; opened bumps count', () => {
    const { db, tick } = setup();
    const ids = Array.from({ length: 6 }, (_, i) => db.items.create({ type: 'note', title: `n${i}` }).id);
    for (const id of ids) { tick(); db.items.pin(id); }
    const pinned = db.items.list({ view: 'pinned' }).map((i) => i.title);
    expect(pinned).toEqual(['n5', 'n4', 'n3', 'n2', 'n1']);
    db.items.opened(ids[0]!); db.items.opened(ids[0]!);
    expect(db.items.get(ids[0]!)!.open_count).toBe(2);
    expect(db.items.list({ sort: 'opened' })[0]!.title).toBe('n0');
  });
});

describe('tags, spaces, files, fts', () => {
  it('FTS row reflects tag and title changes', () => {
    const { db, raw } = setup();
    const search = (q: string) => raw.query<{ rowid: number }>('SELECT rowid FROM items_fts WHERE items_fts MATCH ?', [q]).length;
    const it1 = db.items.create({ type: 'link', title: 'Café', domain: 'example.com' });
    db.tags.set(it1.id, ['coffee', 'paris']);
    expect(search('coffee')).toBe(1);
    expect(search('cafe')).toBe(1);
    expect(db.tags.of(it1.id)).toEqual(['coffee', 'paris']);
    db.tags.set(it1.id, ['paris']);
    expect(search('coffee')).toBe(0);
    expect(search('paris')).toBe(1);
    db.items.update(it1.id, { title: 'Tea' });
    expect(search('cafe')).toBe(0);
    expect(search('tea')).toBe(1);
    expect(search('example')).toBe(1);
    // a remote tag op also reindexes
    db.applyRemoteOp(op({ tbl: 'tags', rowId: `${it1.id}|remote`, col: 'source', value: 'user' }));
    expect(search('remote')).toBe(1);
    expect(db.tags.all()).toEqual([{ tag: 'paris', count: 1 }, { tag: 'remote', count: 1 }]);
    expect(raw.query('SELECT * FROM items_fts').length).toBe(1);
  });

  it('spaces and files are tombstoned sets', () => {
    const { db } = setup();
    const a = db.items.create({ type: 'note', title: 'a' });
    const s = db.spaces.create('Reading');
    db.spaces.addItem(s.id, a.id);
    expect(db.spaces.itemsOf(s.id).map((i) => i.id)).toEqual([a.id]);
    db.spaces.removeItem(s.id, a.id);
    expect(db.spaces.itemsOf(s.id)).toEqual([]);
    db.spaces.rename(s.id, 'Read');
    expect(db.spaces.list()[0]!.name).toBe('Read');
    db.spaces.delete(s.id);
    expect(db.spaces.list()).toEqual([]);
    db.files.add({ hash: 'h1', item_id: a.id, role: 'thumb', mime: 'image/jpeg', bytes: 10, w: 1, h: 1, blurhash: null });
    expect(db.files.of(a.id).length).toBe(1);
    db.files.remove('h1');
    expect(db.files.of(a.id).length).toBe(0);
  });
});

describe('jobs', () => {
  it('lifecycle: enqueue (dedup) -> next -> fail/backoff -> done, skip/reenqueue', () => {
    const { db, now, tick } = setup();
    const id = db.jobs.enqueue('item', 'extract');
    expect(db.jobs.enqueue('item', 'extract')).toBe(id);
    expect(db.jobs.next()?.id).toBe(id);
    expect(db.jobs.next()).toBeUndefined();
    db.jobs.fail(id, 'boom', 5000);
    expect(db.jobs.next()).toBeUndefined();
    tick(5000);
    expect(db.jobs.next(now())).toMatchObject({ id, attempts: 1, error: 'boom' });
    db.jobs.done(id);
    expect(db.jobs.get(id)!.status).toBe('done');
    const o = db.jobs.enqueue('item', 'ocr');
    db.jobs.skip(o);
    expect(db.jobs.next()).toBeUndefined();
    db.jobs.reenqueueSkipped('ocr');
    expect(db.jobs.next()?.id).toBe(o);
    for (let i = 0; i < 5; i++) db.jobs.fail(o, 'x', 0);
    expect(db.jobs.get(o)!.status).toBe('failed');
  });
});

describe('trace', () => {
  const base = { created_at: 0, opened_at: null, open_count: 0, resurfaced_at: null, let_go_at: null, pinned_at: null };
  it('is bounded, monotone in recency and opens, 0 after let go, 1 when pinned', () => {
    const now = 100 * DAY;
    expect(traceStrength({ ...base, pinned_at: 1 }, now)).toBe(1);
    expect(traceStrength({ ...base, let_go_at: now - 10 * DAY }, now)).toBe(0);
    expect(traceStrength({ ...base, let_go_at: now - 100 * DAY }, now)).toBeGreaterThan(0);
    let prev = traceStrength({ ...base, created_at: now }, now);
    for (let d = 1; d < 400; d += 7) {
      const s = traceStrength({ ...base, created_at: now - d * DAY }, now);
      expect(s).toBeLessThanOrEqual(prev); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1);
      prev = s;
    }
    prev = 0;
    for (let o = 0; o < 20; o++) {
      const s = traceStrength({ ...base, created_at: now - 30 * DAY, opened_at: now - 30 * DAY, open_count: o }, now);
      expect(s).toBeGreaterThanOrEqual(prev); prev = s;
    }
  });

  it('resurfaceCandidates excludes pinned, recent, let-go and recently resurfaced', () => {
    const { db, raw, tick } = setup();
    const old = db.items.create({ type: 'note', title: 'old' });
    const fresh = db.items.create({ type: 'note', title: 'fresh' });
    const pinned = db.items.create({ type: 'note', title: 'pinned' });
    const letGo = db.items.create({ type: 'note', title: 'letgo' });
    tick(100 * DAY);
    db.items.pin(pinned.id);
    db.items.opened(fresh.id);
    db.items.update(letGo.id, { let_go_at: db.items.get(letGo.id)!.created_at + 99 * DAY });
    const ids = resurfaceCandidates(raw, db.items.get(old.id)!.created_at + 100 * DAY).map((i) => i.title);
    expect(ids).toEqual(['old']);
  });
});
