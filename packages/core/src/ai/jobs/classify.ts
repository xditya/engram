import type { Item, ItemType } from '../../model/types';
import type { Provider } from '../types';
import { classifyPrompt, classifyUser, type Correction, ITEM_TYPES } from '../prompts';

export interface ClassifyPatch { type?: ItemType; tags?: string[]; summary?: string; title?: string }

// A title that is only a placeholder: missing, the bare domain, a file name, or a first line that was cut off or
// stops mid-thought. The model's title replaces these and nothing else.
export function weakTitle(item: Pick<Item, 'title' | 'domain' | 'body'>): boolean {
  const t = item.title?.trim();
  if (!t) return true;
  if (item.domain && t === item.domain) return true;
  if (/\.[a-z0-9]{2,4}$/i.test(t) || /^(img|image|photo|screenshot|pxl|dsc|vid|video)[ _-]?\d/i.test(t)) return true;
  if (t.length >= 80) return true;
  if (/[,:;(\-–—]$/.test(t) || /\b(and|or|the|of|to|a|an|with|for|in|on|at|but|so|is|are)$/i.test(t)) return true;
  // The first line of a longer note that runs on without a full stop reads as a fragment.
  const firstLine = item.body?.trim().split('\n')[0]?.trim();
  return !!firstLine && firstLine === t && (item.body?.trim().includes('\n') ?? false) && t.split(/\s+/).length > 12 && !/[.!?]$/.test(t);
}

export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const clean = tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean);
  return [...new Set(clean)].slice(0, 8);
}

export async function classify(provider: Provider, item: Item, opts: { instructions?: string; corrections?: Correction[]; summaries?: boolean } = {}): Promise<ClassifyPatch> {
  const summaries = (opts.summaries ?? true) && provider.capabilities().summaries;
  const out = JSON.parse(await provider.complete({ system: classifyPrompt({ ...opts, summaries }), user: classifyUser(item), json: true, maxTokens: 400 }));
  const patch: ClassifyPatch = { tags: cleanTags(out.tags) };
  if (weakTitle(item) && typeof out.title === 'string' && out.title.trim()) patch.title = out.title.trim().replace(/^["']|["']$/g, '').slice(0, 120);
  if ((ITEM_TYPES as readonly string[]).includes(out.type) && out.type !== item.type) patch.type = out.type;
  if (summaries && typeof out.summary === 'string' && out.summary.trim()) patch.summary = out.summary.trim();
  return patch;
}
