import type { FileRow, Item } from '@engram/core';
import type { Engram } from '../../lib/engram';

// Same pick order as the Library: generated thumb, poster, else an image original.
export function thumbOf(e: Engram, item: Item): { uri: string; row: FileRow } | null {
  const rows = e.db.files.of(item.id);
  const row = rows.find((r) => r.role === 'thumb') ?? rows.find((r) => r.role === 'poster') ?? rows.find((r) => r.role === 'original' && r.mime?.startsWith('image/'));
  return row ? { uri: e.platform.files.path(row.hash), row } : null;
}
