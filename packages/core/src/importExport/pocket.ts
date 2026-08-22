import { parseCsvRecords } from './csv';
import type { ImportedCard, ImportResult } from './types';
import { parseDate, splitTags } from './util';

export function importPocket(csv: string): ImportResult {
  const { rows } = parseCsvRecords(csv);
  const cards: ImportedCard[] = [];
  for (const r of rows) {
    if (!r['url']) continue;
    const tags = splitTags(r['tags'], /[|,]/);
    if (r['status'] === 'archive') tags.push('archived');
    const card: ImportedCard = { type: 'link', url: r['url'], tags };
    if (r['title']) card.title = r['title'];
    const createdAt = parseDate(r['time_added']);
    if (createdAt !== undefined) card.createdAt = createdAt;
    cards.push(card);
  }
  return { cards, unmatchedFiles: [], warnings: [] };
}
