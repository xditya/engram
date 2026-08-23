import type { Item } from '../model/types';

// Tags already in the library that appear as whole words in the card's text (title, body, OCR text, url/domain).
// A hierarchical tag like design/type matches on its last segment. Short tags (<3 chars) are skipped: too noisy.
export function matchTags(text: string, existing: string[]): string[] {
  const hay = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const out: string[] = [];
  for (const tag of existing) {
    const leaf = tag.split('/').pop()!.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (leaf.length < 3) continue;
    if (hay.includes(` ${leaf} `)) out.push(tag);
  }
  return out;
}

export const autotagText = (i: Pick<Item, 'title' | 'body' | 'ocr_text' | 'url' | 'domain' | 'summary'>) =>
  [i.title, i.body?.slice(0, 4000), i.ocr_text, i.summary, i.domain, i.url?.replace(/^https?:\/\//, '')].filter(Boolean).join('\n');
