import type { Item } from '../model/types';

// Words that turn up as "tags" from a small model or a frequency count but that nobody would search for:
// function words, pronouns, contractions, numbers, generic nouns. A tag has to name a topic.
const NOT_A_TAG = new Set(('a an the and or but if then than so as of to in on at by for with from into over under about after before ' +
  'it its this that these those there here where when why how what which who whom whose ' +
  'i me my we us our you your he him his she her they them their one ones some any all every each both few more most other another such ' +
  'is are was were be been being have has had do does did can could will would shall should may might must ' +
  'not no yes also just only very really quite too even still again ever never always often ' +
  'thing things something anything everything nothing stuff way ways time times day days year years people person world life ' +
  'post posts page pages article articles link links site website blog read reading new old good best great back next first last ' +
  'example type kind sort part parts lot lots much many long short big small').split(' '));

// Something a person would type into a search: at least three characters, not a number, no apostrophe, not made
// of filler words only.
export function isTag(t: string): boolean {
  const w = t.trim().toLowerCase();
  return w.length >= 3 && w.length <= 40 && !/['’]/.test(w) && !/^\d+$/.test(w) && !NOT_A_TAG.has(w) && !w.split(/[\s-]+/).every((x) => NOT_A_TAG.has(x));
}

// Tags already in the library that appear as whole words in the card's text (title, body, OCR text, url/domain).
// A hierarchical tag like design/type matches on its last segment. Short tags (<3 chars) are skipped: too noisy.
export function matchTags(text: string, existing: string[]): string[] {
  const hay = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const out: string[] = [];
  for (const tag of existing) {
    const leaf = tag.split('/').pop()!.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (leaf.length < 3 || !isTag(leaf)) continue;
    if (hay.includes(` ${leaf} `)) out.push(tag);
  }
  return out;
}

export const autotagText = (i: Pick<Item, 'title' | 'body' | 'ocr_text' | 'url' | 'domain' | 'summary'>) =>
  [i.title, i.body?.slice(0, 4000), i.ocr_text, i.summary, i.domain, i.url?.replace(/^https?:\/\//, '')].filter(Boolean).join('\n');
