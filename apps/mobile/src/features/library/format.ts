import type { ItemType } from '@engram/core';
import type { IconName } from '../../icons/Icon';
import { theme } from '../../theme/theme';

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

// Column count and gutter for the stored density: Normal is 2 columns / 8 px; Comfortable and Dense move one column either way.
export const gridLayout = (density: 'comfortable' | 'cozy' | 'compact', width: number, pad = 16) => {
  const d = theme.density[density === 'compact' ? 'dense' : density === 'comfortable' ? 'comfortable' : 'normal'];
  const cols = Math.max(1, 2 + d.cols);
  const colW = Math.floor((width - pad * 2 - d.gutter * (cols - 1)) / cols);
  return { cols, gutter: d.gutter, colW, dense: density === 'compact' };
};
