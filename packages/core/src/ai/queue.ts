import type { Database } from '../platform';
import type { IntelligenceSettings, Item, Job, JobKind } from '../model/types';
import type { Provider } from './types';
import { classify } from './jobs/classify';
import { embed } from './jobs/embed';
import { describeImage } from './jobs/describeImage';
import { type Correction, itemText } from './prompts';
import { estimateCost } from './cost';

export interface QueueWriter {
  update(itemId: string, patch: Partial<Item>): void;
  addTags(itemId: string, tags: string[], source: 'ai'): void;
  getItem(id: string): Item | null;
  filesOf(itemId: string): { hash: string; role: string; mime: string | null }[];
}

export interface QueueOptions {
  db: Database;
  now: () => number;
  provider: () => Provider | null;
  embedder?: () => Provider | null; // defaults to provider()
  settings: () => IntelligenceSettings;
  platform: { ocr?: (path: string) => Promise<string>; files: { read(hash: string): Promise<Uint8Array>; path(hash: string): string } };
  writer: QueueWriter;
  handlers?: Partial<Record<JobKind, (itemId: string) => Promise<void>>>; // extract/thumb/colors, wired by the app
  prompt?: () => { instructions?: string; corrections?: Correction[] };
  spent?: () => number; // USD spent this month; the app persists and resets it
  onSpend?: (usd: number) => void;
  concurrency?: number;
  id?: () => string;
}

const MAX_ATTEMPTS = 5;
const PROVIDER_KINDS: JobKind[] = ['classify', 'embed', 'describe_image'];

class Skip extends Error {}

export function createQueue(o: QueueOptions) {
  const db = o.db;
  let paused = false;
  const id = o.id ?? (() => `${o.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  const set = (job: Job, patch: Partial<Job>) => {
    const cols = Object.keys(patch) as (keyof Job)[];
    db.exec(`UPDATE jobs SET ${cols.map((c) => `${c}=?`).join(', ')} WHERE id=?`, [...cols.map((c) => patch[c]), job.id]);
  };

  const needItem = (job: Job) => {
    const item = job.item_id ? o.writer.getItem(job.item_id) : null;
    if (!item) throw new Error('item missing');
    return item;
  };

  // Returns the estimated cost so it can be booked after success; throws Skip when over the cap.
  const guardBudget = (provider: Provider, chars: number, model: string) => {
    const budget = o.settings().monthlyBudgetUsd;
    if (budget == null || !o.spent) return 0;
    const { usd } = estimateCost(1, chars, provider.id, model);
    if (o.spent() + usd > budget) throw new Skip('budget: monthly cap reached');
    return usd;
  };

  const applyPatch = (itemId: string, patch: Partial<Item> & { tags?: string[] }) => {
    const { tags, ...cells } = patch;
    if (Object.keys(cells).length) o.writer.update(itemId, cells);
    if (tags?.length) o.writer.addTags(itemId, tags, 'ai');
  };

  const run = async (job: Job): Promise<void> => {
    const handler = o.handlers?.[job.kind];
    if (handler) return handler(job.item_id!);
    if (job.kind === 'ocr') {
      if (!o.platform.ocr) throw new Skip('ocr unavailable on this device');
      const item = needItem(job);
      const f = o.writer.filesOf(item.id).find((x) => x.role === 'original') ?? o.writer.filesOf(item.id).find((x) => x.role === 'thumb');
      if (!f) throw new Error('no file to ocr');
      o.writer.update(item.id, { ocr_text: await o.platform.ocr(o.platform.files.path(f.hash)) });
      return;
    }
    if (!PROVIDER_KINDS.includes(job.kind)) throw new Error(`no handler for ${job.kind}`);
    const provider = o.provider();
    if (!provider) throw new Skip('no provider');
    const item = needItem(job);
    const s = o.settings();
    if (job.kind === 'classify') {
      const usd = guardBudget(provider, itemText(item).length, s.chatModel ?? '*');
      applyPatch(item.id, await classify(provider, item, { ...o.prompt?.(), summaries: s.summaries }));
      o.onSpend?.(usd);
    } else if (job.kind === 'embed') {
      const embedder = (o.embedder ?? o.provider)();
      if (!embedder?.embed) throw new Skip('no embedding provider');
      const tags = db.query<{ tag: string }>('SELECT tag FROM tags WHERE item_id=? AND deleted_at IS NULL', [item.id]).map((r) => r.tag);
      const usd = guardBudget(embedder, itemText(item).length, s.embedModel ?? '*');
      o.writer.update(item.id, await embed(embedder, item, { tags }));
      o.onSpend?.(usd);
    } else {
      if (!s.describeImages) throw new Skip('describeImages off');
      if (!provider.capabilities().vision) throw new Skip('provider has no vision');
      const f = o.writer.filesOf(item.id).find((x) => x.role === 'thumb') ?? o.writer.filesOf(item.id).find((x) => x.role === 'original');
      if (!f) throw new Error('no image file');
      const usd = guardBudget(provider, 4000, s.visionModel ?? s.chatModel ?? '*'); // an image is roughly 1k input tokens
      const image = { bytes: await o.platform.files.read(f.hash), mime: f.mime ?? 'image/jpeg' };
      applyPatch(item.id, await describeImage(provider, item, { image }));
      o.onSpend?.(usd);
    }
  };

  const runOne = async (job: Job) => {
    try {
      await run(job);
      set(job, { status: 'done', error: null });
    } catch (e) {
      const error = (e as Error).message ?? String(e);
      if (e instanceof Skip) return set(job, { status: 'skipped', error });
      const attempts = job.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) set(job, { status: 'failed', attempts, error });
      else set(job, { status: 'pending', attempts, error, run_after: o.now() + 2 ** attempts * 30_000 });
    }
  };

  return {
    // Runs one batch; returns how many jobs it picked up. Loop until 0.
    async tick(): Promise<number> {
      if (paused) return 0;
      const limit = o.concurrency ?? (o.provider()?.id === 'on-device' ? 1 : 2);
      const jobs = db.query<Job>("SELECT * FROM jobs WHERE status='pending' AND (run_after IS NULL OR run_after<=?) ORDER BY created_at LIMIT ?", [o.now(), limit]);
      if (!jobs.length) return 0;
      db.exec(`UPDATE jobs SET status='running' WHERE id IN (${jobs.map(() => '?').join(',')})`, jobs.map((j) => j.id));
      await Promise.all(jobs.map(runOne));
      return jobs.length;
    },
    enqueueFor(itemId: string, kinds: JobKind[]) {
      const now = o.now();
      db.transaction(() => {
        for (const kind of kinds) db.exec("INSERT INTO jobs (id, item_id, kind, status, attempts, run_after, created_at) VALUES (?,?,?,'pending',0,?,?)", [id(), itemId, kind, now, now]);
      });
    },
    // Call when a provider appears, settings change, or ocr becomes available. Returns how many were revived.
    reenqueueSkipped(kinds: JobKind[] = [...PROVIDER_KINDS, 'ocr']): number {
      const ph = kinds.map(() => '?').join(',');
      const n = db.query<{ n: number }>(`SELECT count(*) n FROM jobs WHERE status='skipped' AND kind IN (${ph})`, kinds)[0]?.n ?? 0;
      db.exec(`UPDATE jobs SET status='pending', attempts=0, error=NULL, run_after=? WHERE status='skipped' AND kind IN (${ph})`, [o.now(), ...kinds]);
      return n;
    },
    retry(jobId: string) { db.exec("UPDATE jobs SET status='pending', attempts=0, error=NULL, run_after=? WHERE id=?", [o.now(), jobId]); },
    pause() { paused = true; },
    resume() { paused = false; },
  };
}

export type Queue = ReturnType<typeof createQueue>;
