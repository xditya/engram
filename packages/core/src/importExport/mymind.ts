import type { ItemType } from '../model/types';
import { parseCsvRecords } from './csv';
import type { ImportedCard, ImportResult } from './types';
import { parseDate, splitTags } from './util';

const KNOWN = ['id', 'uuid', 'card_id', 'type', 'kind', 'title', 'name', 'url', 'link', 'source', 'text', 'notes', 'note', 'body', 'content', 'description', 'summary', 'created', 'created_at', 'date', 'updated', 'updated_at', 'tags', 'tag', 'file', 'filename', 'domain', 'ai_tags'];
const pick = (r: Record<string, string>, ...keys: string[]) => { for (const k of keys) if (r[k]) return r[k]; return undefined; };

const TYPE: Record<string, ItemType> = {
  note: 'note', text: 'note', quote: 'quote', highlight: 'quote', link: 'link', url: 'link', website: 'link', bookmark: 'link',
  article: 'article', image: 'image', photo: 'image', screenshot: 'image', video: 'video', pdf: 'pdf', file: 'file', document: 'file',
  product: 'product', book: 'book', recipe: 'recipe', tweet: 'tweet', repo: 'repo',
};

// Accepts both mymind's "Export my mind" cards.csv and our own cards.csv (same loose column vocabulary).
export function importMymind(cardsCsv: string, fileNames: string[] = []): ImportResult {
  const { header, rows } = parseCsvRecords(cardsCsv);
  const warnings: string[] = [];
  const unknown = header.filter((h) => !KNOWN.includes(h));
  if (unknown.length) warnings.push(`ignored columns: ${unknown.join(', ')}`);

  // ponytail: files match rows by "<id>.<ext>" only; add a filename-column lookup if an export ever names them differently
  const byStem = new Map<string, string>();
  for (const f of fileNames) byStem.set(f.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''), f);
  const used = new Set<string>();

  const cards: ImportedCard[] = rows.map((r) => {
    const id = pick(r, 'id', 'uuid', 'card_id');
    const url = pick(r, 'url', 'link', 'source');
    const body = pick(r, 'text', 'notes', 'note', 'body', 'content', 'description');
    const fileRef = pick(r, 'file', 'filename') ?? (id ? byStem.get(id) : undefined);
    if (fileRef) used.add(fileRef);
    const declared = TYPE[(pick(r, 'type', 'kind') ?? '').toLowerCase()];
    const type: ItemType = declared ?? (fileRef ? fileTypeOf(fileRef) : url ? 'link' : 'note');
    const card: ImportedCard = { type, tags: [...splitTags(pick(r, 'tags', 'tag')), ...splitTags(r['ai_tags'])] };
    const title = pick(r, 'title', 'name');
    if (title) card.title = title;
    if (url) card.url = url;
    if (body) card.body = body;
    if (fileRef) card.fileRef = fileRef;
    if (id) card.sourceId = id;
    const createdAt = parseDate(pick(r, 'created', 'created_at', 'date'));
    if (createdAt !== undefined) card.createdAt = createdAt;
    return card;
  });

  return { cards, unmatchedFiles: fileNames.filter((f) => !used.has(f)), warnings };
}

export function fileTypeOf(name: string): ItemType {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg', 'bmp', 'avif'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  return 'file';
}
