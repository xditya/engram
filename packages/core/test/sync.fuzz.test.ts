import { describe, expect, it } from 'vitest';
import { createSharedStore, DAY, dump, makeDevice, type Device } from './fixtures/sync/device';
import { createMemoryAdapter, type StorageAdapter } from '../src/storage';

const HOUR = 3_600_000;
const SEEDS = process.env.SEEDS ? Array.from({ length: Number(process.env.SEEDS) }, (_, i) => i + 1) : Array.from({ length: 20 }, (_, i) => i + 1);
const STEPS = Number(process.env.STEPS ?? 120);

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(xs: T[]) => xs[Math.floor(next() * xs.length)]!, chance: (p: number) => next() < p };
}

async function run(seed: number) {
  const r = rng(seed);
  let t = 1_700_000_000_000;
  const chaos = { on: true };
  const store = createSharedStore();
  const base = createMemoryAdapter(store, { now: () => t, delayVisibilityMs: r.chance(0.5) ? r.int(5 * 60_000) : 0, pageSize: 7 });
  // chaos wrapper: duplicated puts, puts whose success is lost, transient read failures
  const wrap = (): StorageAdapter => ({
    ...base,
    async putIfAbsent(k, b) {
      const res = await base.putIfAbsent(k, b);
      if (chaos.on && r.chance(0.1)) await base.putIfAbsent(k, b);
      if (chaos.on && r.chance(0.05)) throw new Error('chaos: lost ack');
      return res;
    },
    async get(k) { if (chaos.on && r.chance(0.05)) throw new Error('chaos: get failed'); return base.get(k); },
  });
  const N = 2 + r.int(5);
  const devs: Device[] = [];
  const skew: number[] = [];
  for (let i = 0; i < N; i++) {
    skew.push(r.int(2 * HOUR) - HOUR);
    devs.push(makeDevice(`d${i}`, store, () => t + skew[i]!, wrap()));
  }
  const online = devs.map(() => true);
  let stale: number | null = null;
  const created = new Set<string>();
  const letGone = new Set<string>();
  const oracle = new Map<string, { hlc: string; deleted: boolean }>(); // latest deleted_at op per item, as the merge should pick it
  const noteDelete = (d: Device, id: string, deleted: boolean) => {
    const hlc = d.raw.query<{ h: string }>("SELECT MAX(hlc) h FROM ops WHERE tbl = 'items' AND row_id = ? AND col = 'deleted_at'", [id])[0]!.h;
    if (!oracle.has(id) || oracle.get(id)!.hlc < hlc) oracle.set(id, { hlc, deleted });
  };
  let k = 0;
  const sync = async (i: number) => {
    if (!online[i]) return null;
    try { return await devs[i]!.engine.sync({ originals: 'lazy' }); }
    catch (e) { if (!chaos.on) throw e; return null; }
  };
  const liveItems = (d: Device) => d.db.items.list({ limit: 1000 });
  const liveAndRecentTrash = (d: Device) => d.db.items.list({ view: 'trash', limit: 1000 }).filter((i) => i.deleted_at! > d.now() - 25 * DAY);

  for (let step = 0; step < STEPS; step++) {
    const i = r.int(N);
    const d = devs[i]!;
    const items = liveItems(d);
    const roll = r.next();
    if (roll < 0.2) {
      const title = `s${seed}-${k++}`;
      d.db.items.create({ type: r.chance(0.5) ? 'note' : 'link', title, url: r.chance(0.5) ? `https://x.test/${k}` : null, body: r.chance(0.5) ? `b${k}` : null });
      created.add(title);
    } else if (roll < 0.32 && items.length) {
      const it = r.pick(items);
      const field = r.int(3);
      if (field === 0) d.db.items.update(it.id, { body: `edit-${i}-${step}` });
      else if (field === 1) (r.chance(0.5) ? d.db.items.pin : d.db.items.unpin)(it.id);
      else d.db.items.opened(it.id);
    } else if (roll < 0.42 && items.length) {
      const it = r.pick(items);
      const tag = r.pick(['a', 'b', 'c', 'd']);
      if (d.db.tags.of(it.id).includes(tag) && r.chance(0.6)) d.db.tags.remove(it.id, tag); else d.db.tags.add(it.id, tag);
    } else if (roll < 0.5 && items.length) {
      const spaces = d.db.spaces.list();
      if (!spaces.length || r.chance(0.15)) d.db.spaces.create(`sp-${i}-${step}`);
      else {
        const sp = r.pick(spaces);
        const it = r.pick(items);
        if (r.chance(0.7)) d.db.spaces.addItem(sp.id, it.id); else d.db.spaces.removeItem(sp.id, it.id);
      }
    } else if (roll < 0.56 && items.length) {
      const it = r.pick(items);
      d.db.items.letGo(it.id);
      letGone.add(it.title!);
      noteDelete(d, it.id, true);
    } else if (roll < 0.6) {
      const trash = liveAndRecentTrash(d);
      if (trash.length) { const it = r.pick(trash); d.db.items.restore(it.id); noteDelete(d, it.id, false); }
    } else if (roll < 0.78) {
      await sync(i);
    } else if (roll < 0.83) {
      for (let j = 0; j < N; j++) await sync(j);
    } else if (roll < 0.88) {
      if (i !== stale) online[i] = !online[i];
    } else if (roll < 0.92) {
      skew[i] = r.int(2 * HOUR) - HOUR;
    } else if (roll < 0.95) {
      try { await d.engine.gc(); } catch { /* chaos */ }
    } else if (roll < 0.97) {
      if (online[i]) { try { await d.engine.snapshot(); } catch { /* chaos */ } }
    } else if (roll < 0.985) {
      t += 31 * DAY;
    } else if (stale === null && N > 2) {
      chaos.on = false; online[i] = true;
      await sync(i); // everything it saved so far is on the remote; what it saves from now on is not
      chaos.on = true; stale = i; online[i] = false;
      for (let j = 0; j < N; j++) await sync(j);
      t += 181 * DAY;
      for (let j = 0; j < N; j++) await sync(j);
      t += DAY;
      for (let j = 0; j < N; j++) if (j !== i) { try { await devs[j]!.engine.gc(); } catch { /* chaos */ } }
      if (r.chance(0.7)) { try { await devs[r.int(N) === i ? (i + 1) % N : r.int(N)]!.engine.snapshot(); } catch { /* chaos */ } }
    }
    t += r.int(60_000);
  }

  // quiescence: everyone online, chaos off, sync + gc until nothing moves
  chaos.on = false;
  online.fill(true);
  // two passes: settle, then let the trash window close and settle again so late tombstones purge everywhere
  for (const pass of [0, 1]) {
  if (pass) t += 31 * DAY;
  let last = '';
  for (let round = 0; round < 40; round++) {
    let moved = 0;
    for (let i = 0; i < N; i++) { const res = await sync(i); if (!res) throw new Error(`seed ${seed}: sync failed with chaos off`); moved += res.pushed + res.applied; }
    for (const d of devs) moved += (await d.engine.gc()).purged;
    const sig = `${store.objects.size}:${moved}`;
    if (moved === 0 && sig === last) break;
    last = sig;
    t += 10 * 60_000; // past any visibility lag
    if (round === 39) throw new Error(`seed ${seed}: no quiescence`);
  }
  }

  const dumps = devs.map(dump);
  for (let i = 1; i < N; i++) for (const tbl of Object.keys(dumps[0]!)) expect(dumps[i]![tbl], `seed ${seed} N=${N} dev d${i} table ${tbl}`).toBe(dumps[0]![tbl]);
  for (const d of devs) {
    expect(d.raw.query('SELECT * FROM ops WHERE pushed != 1'), `seed ${seed}: unpushed ops on ${d.id}`).toHaveLength(0);
    const titles = new Set(liveItems(d).map((i) => i.title));
    for (const title of created) if (!letGone.has(title)) expect(titles.has(title), `seed ${seed}: ${title} lost on ${d.id}`).toBe(true);
    for (const [id, o] of oracle) { const it = d.db.items.get(id); if (it) expect(it.deleted_at === null, `seed ${seed}: ${id} deleted_at wrong on ${d.id}`).toBe(!o.deleted); }
  }
}

describe('sync convergence fuzz', () => {
  for (const seed of SEEDS) it(`seed ${seed}`, async () => { await run(seed); }, 30_000);
});
