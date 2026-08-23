import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { importExport, type Item } from '@engram/core';
import { engram } from '../../lib/hub';

// Images share the original file; everything else goes out as one markdown file.
export async function shareItem(item: Item): Promise<void> {
  const { db, platform } = engram();
  const original = item.type === 'image' ? db.files.of(item.id).find((f) => f.role === 'original') : undefined;
  if (original) return Sharing.shareAsync(platform.files.path(original.hash), { mimeType: original.mime ?? undefined });
  const tags = db.tags.of(item.id).map((tag) => ({ item_id: item.id, tag, source: 'user' as const, deleted_at: null }));
  const [md] = importExport.toObsidianVault([item], tags);
  if (!md) return;
  const file = new File(Paths.cache, md.path);
  file.write(md.content);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/markdown' });
}
