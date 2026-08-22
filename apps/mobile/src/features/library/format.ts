import type { ItemType } from '@engram/core';
import type { IconName } from '../../icons/Icon';

export const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en', { month: 'short', day: 'numeric' });

const ICONS: Partial<Record<ItemType, IconName>> = {
  note: 'type-note', link: 'type-link', article: 'type-article', image: 'type-image',
  video: 'type-video', pdf: 'type-pdf', quote: 'type-quote', product: 'type-product',
};
export const typeIcon = (t: ItemType): IconName => ICONS[t] ?? 'type-link';

export const parseMeta = (json: string | null): Record<string, unknown> => {
  try { return json ? (JSON.parse(json) as Record<string, unknown>) : {}; } catch { return {}; }
};

export const duration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
