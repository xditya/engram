import { File } from 'expo-file-system';
import JSZip from 'jszip';
import { crypto, importExport, media, sync, type ImportFormat, type ImportedCard, type JobKind } from '@engram/core';
import { addFile } from '../../lib/jobs';
import type { Engram } from '../../lib/engram';

export type Picked = { name: string; format: ImportFormat; cards: ImportedCard[]; files: Map<string, () => Promise<Uint8Array>>; warnings: string[] };
export type Progress = { cards: number; files: number; dupes: number; done: boolean };
export type Tagging = 'later' | 'now';

const SOURCE: Record<ImportFormat, string> = { engram: 'engram', mymind: 'mymind', raindrop: 'Raindrop', pocket: 'Pocket', netscape: 'your browser', obsidian: 'Obsidian' };
export const sourceName = (f: ImportFormat) => SOURCE[f];

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const isText = (n: string) => /\.(csv|json|html?|md|txt)$/i.test(n);

// A zip (mymind export, our own export, an Obsidian vault) or a single csv/json/html/md file.
export async function read(uri: string, name: string): Promise<Picked> {
  const bytes = await new File(uri).bytes();
  const files = new Map<string, () => Promise<Uint8Array>>();
  const texts: { path: string; content: string }[] = [];
  if (/\.zip$/i.test(name)) {
    const zip = await JSZip.loadAsync(bytes);
    for (const [path, f] of Object.entries(zip.files)) {
      if (f.dir || path.startsWith('__MACOSX')) continue;
      if (isText(path)) texts.push({ path, content: await f.async('string') });
      else files.set(path, () => f.async('uint8array'));
    }
  } else {
    texts.push({ path: name, content: text(bytes) });
  }
  const main = texts.find((t) => /(^|\/)(cards|engram)\.(csv|json)$/i.test(t.path)) ?? texts.find((t) => !/\.md$/i.test(t.path)) ?? texts[0];
  if (!main) throw new Error('Nothing to import in this file.');
  const format = importExport.detectFormat(main.path, main.content.slice(0, 4096));
  if (!format) throw new Error("Couldn't recognise this file.");
  const fileNames = [...files.keys()];
  const r =
    format === 'mymind' ? importExport.importMymind(main.content, fileNames)
    : format === 'raindrop' ? importExport.importRaindrop(main.content)
    : format === 'pocket' ? importExport.importPocket(main.content)
    : format === 'netscape' ? importExport.importNetscape(main.content)
    : format === 'obsidian' ? importExport.importObsidian(texts.filter((t) => /\.md$/i.test(t.path)))
    : fromEngram(main.content, fileNames);
  return { name, format, cards: r.cards, files, warnings: r.warnings };
}

// Our own export: items carry tags by source; reduce to cards so one import path serves every format.
function fromEngram(json: string, fileNames: string[]) {
  const d = importExport.fromEngramJson(json);
  const byItem = new Map<string, string[]>();
  for (const t of d.tags) if (!t.deleted_at) byItem.set(t.item_id, [...(byItem.get(t.item_id) ?? []), t.tag]);
  const original = new Map(d.files.filter((f) => f.role === 'original' && !f.deleted_at).map((f) => [f.item_id, f.hash]));
  const cards: ImportedCard[] = d.items.filter((i) => !i.deleted_at).map((i) => {
    const c: ImportedCard = { type: i.type, tags: byItem.get(i.id) ?? [], createdAt: i.created_at, sourceId: i.id };
    if (i.title) c.title = i.title;
    if (i.url) c.url = i.url;
    if (i.body) c.body = i.body;
    const hash = original.get(i.id);
    const ref = hash ? fileNames.find((n) => n.includes(hash)) : undefined;
    if (ref) c.fileRef = ref;
    return c;
  });
  return { cards, unmatchedFiles: [], warnings: [] };
}

const domainOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; } };

// Cards go straight into the db (no page fetches, no paid jobs unless tagging now). Chunked so the UI keeps up.
export async function run(e: Engram, p: Picked, tagging: Tagging, onProgress: (x: Progress) => void): Promise<Progress> {
  const { db } = e;
  const sql = e.platform.db;
  const prog: Progress = { cards: 0, files: 0, dupes: 0, done: false };
  const tagKinds: JobKind[] = tagging === 'now' ? ['classify', 'embed'] : [];
  for (const card of p.cards) {
    const url = card.url ? sync.normalizeUrl(card.url) : null;
    if (url && sql.query('SELECT 1 FROM items WHERE url = ? AND deleted_at IS NULL LIMIT 1', [url]).length) { prog.dupes++; continue; }
    let bytes: Uint8Array | undefined;
    const mime = card.fileRef ? media.mimeFromExtension(card.fileRef) ?? 'application/octet-stream' : null;
    const readFile = card.fileRef ? p.files.get(card.fileRef) : undefined;
    if (readFile) {
      bytes = await readFile();
      if (sql.query('SELECT 1 FROM files WHERE hash = ? AND deleted_at IS NULL LIMIT 1', [crypto.blake3Hex(bytes)]).length) { prog.dupes++; continue; }
    }
    const item = db.items.create({
      type: card.type, url, domain: url ? domainOf(url) : null,
      title: card.title ?? (url ? domainOf(url) : null) ?? card.fileRef?.replace(/^.*\//, '') ?? card.body?.split('\n')[0]?.slice(0, 80) ?? null,
      body: card.body ?? null,
      created_at: card.createdAt ?? e.platform.now(),
    });
    if (card.tags.length) db.tags.set(item.id, [...new Set(card.tags)], 'import');
    const kinds: JobKind[] = [...tagKinds];
    // A link card needs extract for its title, text and preview image; extract queues tagging itself afterwards.
    if (url && card.type !== 'image' && card.type !== 'video') kinds.unshift('extract');
    if (bytes) {
      await addFile(e, item.id, 'original', bytes, mime);
      prog.files++;
      if (card.type === 'image') kinds.unshift('thumb', 'ocr'); else if (card.type === 'video') kinds.unshift('thumb');
    }
    if (kinds.length) e.queue.enqueueFor(item.id, kinds);
    prog.cards++;
    if (prog.cards % 25 === 0) { onProgress({ ...prog }); await new Promise((r) => setTimeout(r)); }
  }
  prog.done = true;
  onProgress({ ...prog });
  void e.drain();
  return prog;
}
