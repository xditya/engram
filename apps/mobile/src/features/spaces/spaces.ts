import { search, type Item, type Space } from '@engram/core';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Engram } from '../../lib/engram';

// ponytail: core db.spaces only writes name on edit; query/sort go straight to SQL (not replicated)
// until core grows spaces.update(id, { query?, sort? }).
export function setSpace(e: Engram, id: string, cells: { name?: string; query?: string | null; sort?: number }) {
  if (cells.name !== undefined) e.db.spaces.rename(id, cells.name);
  const rest = Object.entries(cells).filter(([k, v]) => k !== 'name' && v !== undefined);
  if (!rest.length) return;
  e.platform.db.exec(`UPDATE spaces SET ${rest.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`, [...rest.map(([, v]) => v), id]);
  e.events.emit();
}

export const reorderSpaces = (e: Engram, ids: string[]) => {
  e.platform.db.transaction(() => ids.forEach((id, i) => e.platform.db.exec('UPDATE spaces SET sort = ? WHERE id = ?', [i + 1, id])));
  e.events.emit();
};

// Query hits plus hand-added members, deduped; manual members first so they are visible even when the query is broad.
export function spaceItems(e: Engram, s: Space): { items: Item[]; manual: number } {
  const manual = e.db.spaces.itemsOf(s.id);
  const seen = new Set(manual.map((i) => i.id));
  const hits = s.query?.trim() ? search.search(e.platform.db, s.query, { limit: 500 }).filter((i) => !seen.has(i.id)) : [];
  return { items: [...manual, ...hits], manual: manual.length };
}

export async function exportSpace(e: Engram, s: Space) {
  const { items } = spaceItems(e, s);
  const line = (i: Item) => {
    const title = i.title ?? i.body?.split('\n')[0] ?? i.url ?? i.type;
    return i.url ? `- [${title}](${i.url})` : `- ${title}`;
  };
  const md = [`# ${s.name}`, '', s.query ? `\`${s.query}\`` : '', '', ...items.map(line), ''].join('\n');
  const file = new File(Paths.cache, `${s.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'space'}.md`);
  file.write(md);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/markdown', dialogTitle: s.name });
}
