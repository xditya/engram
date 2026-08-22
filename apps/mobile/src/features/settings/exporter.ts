import { Platform as RN } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { importExport, type ExportData, type FileRow, type Item, type Space, type SpaceItem, type Tag } from '@engram/core';
import type { Engram } from '../../lib/engram';

export type Progress = { cards: number; cardsTotal: number; files: number; filesTotal: number; done: boolean };

export function sizeOf(e: Engram): { cards: number; bytes: number } {
  const sql = e.platform.db;
  return {
    cards: sql.query<{ n: number }>('SELECT count(*) n FROM items WHERE deleted_at IS NULL')[0]?.n ?? 0,
    bytes: sql.query<{ b: number }>("SELECT coalesce(sum(bytes), 0) b FROM files WHERE role = 'original' AND deleted_at IS NULL")[0]?.b ?? 0,
  };
}

export const human = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

function all(e: Engram): ExportData {
  const q = <T>(sql: string) => e.platform.db.query<T>(sql);
  return {
    items: q<Item>('SELECT * FROM items WHERE deleted_at IS NULL'),
    tags: q<Tag>('SELECT * FROM tags WHERE deleted_at IS NULL'),
    spaces: q<Space>('SELECT * FROM spaces WHERE deleted_at IS NULL'),
    spaceItems: q<SpaceItem>('SELECT * FROM space_items WHERE deleted_at IS NULL'),
    files: q<FileRow>("SELECT * FROM files WHERE role = 'original' AND deleted_at IS NULL"),
  };
}

// ponytail: the whole zip is built in memory (jszip has no streaming writer on RN); libraries past ~1 GB of
// originals need a native zip writer.
export async function run(e: Engram, kind: 'everything' | 'obsidian', onProgress: (p: Progress) => void): Promise<void> {
  const data = all(e);
  const files = kind === 'everything' ? data.files ?? [] : [];
  const prog: Progress = { cards: 0, cardsTotal: data.items.length, files: 0, filesTotal: files.length, done: false };
  const zip = new JSZip();
  const entries = kind === 'everything'
    ? importExport.buildExportBundle({ ...data, files: [] })
    : importExport.toObsidianVault(data.items, data.tags);
  for (const f of entries) zip.file(f.path, f.content);
  prog.cards = prog.cardsTotal;
  onProgress({ ...prog });
  const ext = (m: string | null) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf', 'video/mp4': 'mp4', 'video/quicktime': 'mov' } as Record<string, string>)[m ?? ''] ?? 'bin';
  for (const f of files) {
    try { zip.file(`files/${f.hash}.${ext(f.mime)}`, await e.platform.files.read(f.hash)); } catch { /* missing blob: skip, the row is still in engram.json */ }
    prog.files++;
    if (prog.files % 10 === 0) { onProgress({ ...prog }); await new Promise((r) => setTimeout(r)); }
  }
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  const out = new File(Paths.cache, `engram-${kind === 'obsidian' ? 'notes-' : ''}${new Date().toISOString().slice(0, 10)}.zip`);
  if (out.exists) out.delete();
  out.write(bytes);
  prog.done = true;
  onProgress({ ...prog });
  if (RN.OS !== 'web' && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(out.uri, { mimeType: 'application/zip' });
}
