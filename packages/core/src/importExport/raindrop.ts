import { parseCsvRecords } from './csv';
import type { ImportedCard, ImportResult } from './types';
import { parseDate, splitTags } from './util';

export function importRaindrop(csv: string): ImportResult {
  const { rows } = parseCsvRecords(csv);
  const cards: ImportedCard[] = [];
  for (const r of rows) {
    const url = r['url'];
    if (!url) continue;
    const tags = splitTags(r['tags']);
    if (r['folder']) tags.push(`raindrop/${r['folder'].trim()}`);
    const sourceId = r['id'] || url;
    const createdAt = parseDate(r['created']);
    const card: ImportedCard = { type: 'link', url, tags, sourceId };
    if (r['title']) card.title = r['title'];
    if (r['note'] || r['excerpt']) card.body = r['note'] || r['excerpt'];
    if (createdAt !== undefined) card.createdAt = createdAt;
    cards.push(card);
    for (const h of (r['highlights'] ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
      const q: ImportedCard = { type: 'quote', url, body: h, tags: [...tags], sourceId };
      if (card.title) q.title = card.title;
      if (createdAt !== undefined) q.createdAt = createdAt;
      cards.push(q);
    }
  }
  return { cards, unmatchedFiles: [], warnings: [] };
}
