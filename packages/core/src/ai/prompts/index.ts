import type { Item } from '../../model/types';

export const ITEM_TYPES = ['note', 'link', 'article', 'image', 'video', 'pdf', 'quote', 'product', 'book', 'recipe', 'tweet', 'repo', 'file'] as const;

export interface Correction { title: string; tags: string[] }

export function classifyPrompt(opts: { summaries: boolean; instructions?: string; corrections?: Correction[] }): string {
  const lines = [
    'You file saved items into a personal library. Return JSON only:',
    `{"type": one of ${ITEM_TYPES.join('|')}, "tags": 3-5 short lowercase tags${opts.summaries ? ', "summary": one or two plain sentences' : ''}}`,
    'Tags are topics a person would search for, not formats. Keep the given type unless it is clearly wrong.',
  ];
  if (opts.instructions) lines.push('', 'Extra instructions from the user:', opts.instructions);
  const ex = (opts.corrections ?? []).slice(-10);
  if (ex.length) lines.push('', 'Examples of how this user tags things:', ...ex.map((c) => `- "${c.title}" -> ${c.tags.join(', ')}`));
  return lines.join('\n');
}

export function itemText(item: Item, bodyChars = 2000): string {
  return [item.title, item.url, item.summary, item.body?.slice(0, bodyChars), item.ocr_text].filter(Boolean).join('\n');
}

export const classifyUser = (item: Item) => `Current type: ${item.type}\n\n${itemText(item)}`;

export const DESCRIBE_IMAGE_SYSTEM = 'Describe this image for search in one or two sentences: what it shows, notable text, style. Return JSON only: {"summary": string, "tags": 3-5 lowercase tags}';
