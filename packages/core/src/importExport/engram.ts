import type { Item, Tag } from '../model/types';
import { stringifyCsv } from './csv';
import { toObsidianVault } from './obsidian';
import type { ExportData, ExportFile } from './types';

export const ENGRAM_EXPORT_VERSION = 1;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += B64[n >> 18]! + B64[(n >> 12) & 63]! + (i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < bytes.length ? B64[n & 63]! : '=');
  }
  return s;
}
function unb64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0, acc = 0, j = 0;
  for (const c of clean) { acc = ((acc << 6) | B64.indexOf(c)) & 0xffffff; bits += 6; if (bits >= 8) { bits -= 8; out[j++] = (acc >> bits) & 255; } }
  return out;
}

// Embeddings are the only non-JSON cell; everything else is stored column-for-column.
export function toEngramJson(data: ExportData, exportedAt = Date.now()): string {
  return JSON.stringify({
    engram: ENGRAM_EXPORT_VERSION,
    exportedAt,
    items: data.items.map((i) => ({ ...i, embedding: i.embedding ? b64(i.embedding) : null })),
    tags: data.tags,
    spaces: data.spaces ?? [],
    spaceItems: data.spaceItems ?? [],
    files: data.files ?? [],
  }, null, 2);
}

export function fromEngramJson(json: string): Required<ExportData> {
  const d = JSON.parse(json);
  if (d?.engram !== ENGRAM_EXPORT_VERSION) throw new Error(`not an engram export (version ${d?.engram})`);
  return {
    items: (d.items as (Omit<Item, 'embedding'> & { embedding: string | null })[]).map((i) => ({ ...i, embedding: i.embedding ? unb64(i.embedding) : null })),
    tags: d.tags ?? [],
    spaces: d.spaces ?? [],
    spaceItems: d.spaceItems ?? [],
    files: d.files ?? [],
  };
}

export const CARDS_CSV_HEADER = ['id', 'type', 'title', 'url', 'domain', 'body', 'summary', 'tags', 'ai_tags', 'created', 'updated'];

export function toCardsCsv(items: Item[], tags: Tag[]): string {
  const user = new Map<string, string[]>(), ai = new Map<string, string[]>();
  for (const t of tags) {
    if (t.deleted_at) continue;
    const m = t.source === 'ai' ? ai : user;
    m.set(t.item_id, [...(m.get(t.item_id) ?? []), t.tag]);
  }
  const rows = items.filter((i) => !i.deleted_at).map((i) => [
    i.id, i.type, i.title ?? '', i.url ?? '', i.domain ?? '', i.body ?? '', i.summary ?? '',
    (user.get(i.id) ?? []).join(', '), (ai.get(i.id) ?? []).join(', '),
    new Date(i.created_at).toISOString(), new Date(i.updated_at).toISOString(),
  ]);
  return stringifyCsv([CARDS_CSV_HEADER, ...rows]);
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'text/html': 'html', 'text/markdown': 'md', 'text/plain': 'txt' };

// blobs: hash -> bytes for whichever files the caller chose to read. Zipping is the app's job.
export function buildExportBundle(data: ExportData, blobs: Record<string, Uint8Array> = {}): ExportFile[] {
  const out: ExportFile[] = [
    { path: 'engram.json', content: toEngramJson(data) },
    { path: 'cards.csv', content: toCardsCsv(data.items, data.tags) },
    ...toObsidianVault(data.items, data.tags).map((f) => ({ ...f, path: `notes/${f.path}` })),
  ];
  for (const f of data.files ?? []) {
    const bytes = blobs[f.hash];
    if (bytes && !f.deleted_at) out.push({ path: `files/${f.hash}.${EXT[f.mime ?? ''] ?? 'bin'}`, content: bytes });
  }
  return out;
}
