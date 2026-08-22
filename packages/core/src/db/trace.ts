import type { Database } from '../platform';
import type { Item } from '../model/types';

const DAY = 86_400_000;

export type TraceInput = Pick<Item, 'created_at' | 'opened_at' | 'open_count' | 'resurfaced_at' | 'let_go_at' | 'pinned_at'>;

// 0..1. Pinned = 1, recently let go = 0, otherwise decays with time since last touch and grows with opens.
export function traceStrength(i: TraceInput, now: number): number {
  if (i.pinned_at != null) return 1;
  if (i.let_go_at != null && now - i.let_go_at < 90 * DAY) return 0;
  const last = Math.max(i.created_at, i.opened_at ?? 0, i.resurfaced_at ?? 0);
  const ageDays = Math.max(0, now - last) / DAY;
  // ponytail: half-life 30 d, each open adds 10 %; tune once real usage data exists
  const recency = Math.pow(0.5, ageDays / 30);
  const opens = Math.min(1, 0.4 + 0.1 * i.open_count);
  return Math.min(1, Math.max(0, recency * opens + (1 - recency) * 0.05 * Math.min(i.open_count, 5)));
}

// ponytail: scores every eligible row in JS; push the score into SQL if libraries pass ~50k items
export function resurfaceCandidates(db: Database, now: number, limit = 20): Item[] {
  const rows = db.query<Item>(
    `SELECT * FROM items WHERE deleted_at IS NULL AND pinned_at IS NULL
       AND (let_go_at IS NULL OR let_go_at < ?) AND (resurfaced_at IS NULL OR resurfaced_at < ?)
       AND (opened_at IS NULL OR opened_at < ?)`,
    [now - 90 * DAY, now - 14 * DAY, now - 60 * DAY],
  );
  return rows
    .map((r) => ({ r, s: traceStrength(r, now) }))
    .sort((a, b) => a.s - b.s)
    .slice(0, limit)
    .map((x) => x.r);
}
