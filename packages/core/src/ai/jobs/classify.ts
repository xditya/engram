import type { Item, ItemType } from '../../model/types';
import type { Provider } from '../types';
import { classifyPrompt, classifyUser, type Correction, ITEM_TYPES } from '../prompts';

export interface ClassifyPatch { type?: ItemType; tags?: string[]; summary?: string }

export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const clean = tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean);
  return [...new Set(clean)].slice(0, 8);
}

export async function classify(provider: Provider, item: Item, opts: { instructions?: string; corrections?: Correction[]; summaries?: boolean } = {}): Promise<ClassifyPatch> {
  const summaries = (opts.summaries ?? true) && provider.capabilities().summaries;
  const out = JSON.parse(await provider.complete({ system: classifyPrompt({ ...opts, summaries }), user: classifyUser(item), json: true, maxTokens: 400 }));
  const patch: ClassifyPatch = { tags: cleanTags(out.tags) };
  if ((ITEM_TYPES as readonly string[]).includes(out.type) && out.type !== item.type) patch.type = out.type;
  if (summaries && typeof out.summary === 'string' && out.summary.trim()) patch.summary = out.summary.trim();
  return patch;
}
