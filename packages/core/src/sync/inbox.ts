import type { Database } from '../platform';
import type { StorageAdapter } from '../storage/types';
import type { EngramDb } from '../db';
import type { FileRole, Item } from '../model/types';
import { blake3Hex, open } from '../crypto';
import { aad } from './SyncEngine';

// What the browser extension writes to inbox/<uuid>.enc (sealed with aad = the file key).
export type InboxItem = {
  url: string;
  title?: string;
  text?: string;
  quote?: string;
  html?: string; // reader html; ignored here, the extension ships it as a reader_html blob in files[]
  files?: { hash: string; role: FileRole; mime?: string; bytes?: number; w?: number; h?: number; blurhash?: string }[];
};

export type InboxCtx = {
  db: EngramDb; sql: Database; storage: StorageAdapter; keys: { dataKey: Uint8Array }; now: () => number;
  log: (msg: string) => void; listAll: (prefix: string) => Promise<string[]>;
  quarantine: (key: string, dev: string, e: unknown) => void; remoteKey: (hash: string) => string;
};

const utf8 = new TextEncoder();
const text = new TextDecoder();

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    return u.toString().replace(/\/$/, '');
  } catch { return raw.trim(); }
}

export async function importInbox(ctx: InboxCtx): Promise<number> {
  const { db, sql, storage, keys } = ctx;
  let n = 0;
  for (const key of await ctx.listAll('inbox/')) {
    const bytes = await storage.get(key);
    if (!bytes) continue;
    let card: InboxItem;
    try {
      card = JSON.parse(text.decode(open(keys.dataKey, bytes, aad(key))));
      if (typeof card?.url !== 'string') throw new Error('inbox card has no url');
    } catch (e) { ctx.quarantine(key, 'inbox', e); continue; }
    const url = normalizeUrl(card.url);
    const content = card.quote ?? card.text ?? '';
    const contentHash = blake3Hex(utf8.encode(url + '\n' + content));
    db.transaction(() => {
      const existing = sql.query<Item>('SELECT * FROM items WHERE url = ? AND deleted_at IS NULL LIMIT 1', [url])[0];
      let id: string;
      if (existing) {
        // same url twice: merge new content into the existing card instead of making a second item
        id = existing.id;
        const meta = safeJson(existing.meta);
        if (content && meta.inbox !== contentHash && !(existing.body ?? '').includes(content))
          db.items.update(id, { body: existing.body ? `${existing.body}\n\n${content}` : content, meta: JSON.stringify({ ...meta, inbox: contentHash }) });
      } else {
        id = db.items.create({ type: card.html || card.text ? 'article' : card.quote ? 'quote' : 'link', url, domain: domainOf(url), title: card.title ?? null, body: content || null, meta: JSON.stringify({ inbox: contentHash }) }).id;
      }
      for (const f of card.files ?? []) {
        db.files.add({ hash: f.hash, item_id: id, role: f.role, mime: f.mime ?? null, bytes: f.bytes ?? null, w: f.w ?? null, h: f.h ?? null, blurhash: f.blurhash ?? null });
        sql.exec("INSERT OR IGNORE INTO blob_index (hash, remote_key, bytes, state) VALUES (?, ?, ?, 'remote')", [f.hash, ctx.remoteKey(f.hash), f.bytes ?? null]);
      }
    });
    await storage.delete(key);
    n++;
  }
  return n;
}

const domainOf = (url: string) => { try { return new URL(url).hostname; } catch { return null; } };
const safeJson = (s: string | null): Record<string, unknown> => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
