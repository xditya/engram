import { File } from 'expo-file-system';
import { extract, media, sync, type Database, type EngramDb, type Item, type ItemType, type JobKind, type Queue } from '@engram/core';
import { addFile, type JobCtx } from './jobs';

export type CaptureOpts = { note?: string; tags?: string[]; html?: string };
export type Capture = ReturnType<typeof createCapture>;
// Shape of expo-share-intent's ShareIntent, kept structural so capture.ts never imports the native module.
export type ShareIntentLike = { webUrl?: string | null; text?: string | null; files?: { path: string }[] | null; meta?: { title?: string | null } | null };

const domainOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; } };
const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());
const firstLine = (s: string) => s.trim().split('\n')[0]!.slice(0, 80);

// Every capture path: create the item, enqueue its jobs, kick the queue. Never fetches, so the share sheet
// dismisses instantly; extract/thumb/classify run in the background.
export function createCapture(ctx: Pick<JobCtx, 'platform' | 'db'> & { queue: Queue; sql: Database; drain: () => Promise<void> }) {
  const { db, queue } = ctx;
  const finish = (item: Item, kinds: JobKind[], tags?: string[]) => {
    if (tags?.length) db.tags.set(item.id, tags);
    queue.enqueueFor(item.id, kinds);
    void ctx.drain();
    return item;
  };
  const byUrl = (url: string) => ctx.sql.query<Item>('SELECT * FROM items WHERE url = ? AND deleted_at IS NULL LIMIT 1', [url])[0];

  const capture = {
    async saveUrl(raw: string, o: CaptureOpts = {}): Promise<Item> {
      const url = sync.normalizeUrl(raw);
      const existing = byUrl(url);
      if (existing) {
        // same url twice: merge the note instead of a second card
        if (o.note && !(existing.body ?? '').includes(o.note)) db.items.update(existing.id, { body: existing.body ? `${existing.body}\n\n${o.note}` : o.note });
        if (o.tags?.length) db.tags.set(existing.id, [...new Set([...db.tags.of(existing.id), ...o.tags])]);
        return existing;
      }
      const domain = domainOf(url);
      const item = db.items.create({ type: extract.guessTypeFromUrl(url), url, domain, title: domain, body: o.note ?? null });
      if (o.html) await addFile(ctx, item.id, 'reader_html', new TextEncoder().encode(o.html), 'text/html');
      return finish(item, ['extract'], o.tags);
    },
    saveNote(text: string, o: Pick<CaptureOpts, 'tags'> = {}): Item {
      const item = db.items.create({ type: 'note', title: firstLine(text), body: text.trim() });
      return finish(item, ['classify', 'embed'], o.tags);
    },
    saveQuote(text: string, url?: string, o: Pick<CaptureOpts, 'tags'> = {}): Item {
      const clean = url ? sync.normalizeUrl(url) : null;
      const domain = clean ? domainOf(clean) : null;
      const item = db.items.create({ type: 'quote', url: clean, domain, title: domain ?? firstLine(text), body: text.trim() });
      return finish(item, clean ? ['extract'] : ['classify', 'embed'], o.tags);
    },
    // Local file uris (image picker, document picker, share sheet). One item per file; bytes copied into the FileStore.
    async saveFiles(uris: string[], o: Pick<CaptureOpts, 'tags'> = {}): Promise<Item[]> {
      const out: Item[] = [];
      for (const uri of uris) {
        const f = new File(uri);
        const mime = (f.type && f.type !== 'application/octet-stream' ? f.type : media.mimeFromExtension(f.name)) ?? 'application/octet-stream';
        const type: ItemType = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime === 'application/pdf' ? 'pdf' : 'file';
        const item = db.items.create({ type, title: f.name, meta: JSON.stringify({ filename: f.name }) });
        await addFile(ctx, item.id, 'original', await f.bytes(), mime);
        const kinds: JobKind[] = type === 'image' ? ['thumb', 'ocr', 'classify', 'embed'] : type === 'video' ? ['thumb', 'classify', 'embed'] : ['classify', 'embed'];
        out.push(finish(item, kinds, o.tags));
      }
      return out;
    },
    // What the share sheet / share intent hands us. Returns what was saved (possibly several files).
    async fromShareIntent(s: ShareIntentLike): Promise<Item[]> {
      if (s.webUrl) return [await capture.saveUrl(s.webUrl, { note: s.text && s.text !== s.webUrl ? s.text : undefined })];
      if (s.files?.length) return capture.saveFiles(s.files.map((f) => f.path));
      const text = s.text?.trim();
      if (!text) return [];
      if (isUrl(text)) return [await capture.saveUrl(text)];
      // Android apps share "Title <newline> https://…" as plain text; the title is a poor note, extract reads the real one
      const m = /https?:\/\/[^\s<>"')\]]+/i.exec(text);
      if (!m) return [capture.saveNote(text)];
      const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
      return [await capture.saveUrl(m[0], { note: rest && rest !== s.meta?.title ? rest : undefined })];
    },
  };
  return capture;
}
