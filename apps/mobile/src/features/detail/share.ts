import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { importExport, type Item } from '@engram/core';
import { engram } from '../../lib/hub';

const SITE = 'engram.xditya.me';
const tagline = `\n\nvia ${SITE}`;

// Links share as text (title + url) so any chat app renders its own preview; images share the original file;
// notes share their text; everything else goes out as a markdown file.
export async function shareItem(item: Item): Promise<void> {
  const { db, platform } = engram();
  if (item.url) {
    const title = item.title && item.title !== item.domain ? `${item.title}\n` : '';
    await Share.share({ message: `${title}${item.url}${tagline}`, url: item.url }, { dialogTitle: item.title ?? undefined, subject: item.title ?? undefined });
    return;
  }
  const original = item.type === 'image' ? db.files.of(item.id).find((f) => f.role === 'original') : undefined;
  if (original) return Sharing.shareAsync(platform.files.path(original.hash), { mimeType: original.mime ?? undefined });
  if (item.type === 'note' || item.type === 'quote') {
    await Share.share({ message: `${item.body ?? item.title ?? ''}${tagline}` });
    return;
  }
  const tags = db.tags.of(item.id).map((tag) => ({ item_id: item.id, tag, source: 'user' as const, deleted_at: null }));
  const [md] = importExport.toObsidianVault([item], tags);
  if (!md) return;
  const file = new File(Paths.cache, md.path);
  file.write(md.content);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/markdown' });
}

// What "Copy" puts on the clipboard, and the word the toast uses for it.
export async function copyItem(item: Item): Promise<'Link' | 'Text' | null> {
  if (item.url) { await Clipboard.setStringAsync(item.url); return 'Link'; }
  const text = item.body ?? item.ocr_text ?? item.title;
  if (!text) return null;
  await Clipboard.setStringAsync(text);
  return 'Text';
}
