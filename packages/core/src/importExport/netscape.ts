import type { ImportedCard, ImportResult } from './types';
import { decodeEntities, parseDate, splitTags } from './util';

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1];

// Folder nesting is tracked by <H3> (push) and </DL> (pop); no DOM needed.
export function importNetscape(html: string, opts: { skipFolders?: string[] } = {}): ImportResult {
  const cards: ImportedCard[] = [];
  const path: string[] = [];
  const skip = (opts.skipFolders ?? []).map((s) => s.toLowerCase());
  const re = /<H3[^>]*>([\s\S]*?)<\/H3>|<\/DL>|<A\s([^>]*)>([\s\S]*?)<\/A>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) path.push(decodeEntities(m[1].trim()));
    else if (m[2] !== undefined) {
      const url = attr(m[2], 'HREF');
      if (!url || /^(javascript|place):/i.test(url)) continue;
      if (path.some((p) => skip.includes(p.toLowerCase()))) continue;
      const tags = splitTags(attr(m[2], 'TAGS'));
      if (path.length) tags.push(path.join('/'));
      const card: ImportedCard = { type: 'link', url: decodeEntities(url), tags };
      const title = decodeEntities((m[3] ?? '').trim());
      if (title) card.title = title;
      const createdAt = parseDate(attr(m[2], 'ADD_DATE'));
      if (createdAt !== undefined) card.createdAt = createdAt;
      cards.push(card);
    } else path.pop();
  }
  return { cards, unmatchedFiles: [], warnings: [] };
}
