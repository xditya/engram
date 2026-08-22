import { db, type Item } from '@engram/core';

export const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const readingMinutes = (text: string | null) => Math.max(1, Math.round((text ?? '').split(/\s+/).filter(Boolean).length / 230));
export const metaOf = (item: Item): Record<string, string> => { try { return item.meta ? JSON.parse(item.meta) : {}; } catch { return {}; } };

export function traceLine(item: Item, now = Date.now()) {
  const s = db.traceStrength(item, now);
  const word = s >= 0.66 ? 'Strong' : s >= 0.33 ? 'Fading' : 'Faint';
  const n = item.open_count;
  return { strength: s, text: `${word} trace · opened ${n} ${n === 1 ? 'time' : 'times'}` };
}
