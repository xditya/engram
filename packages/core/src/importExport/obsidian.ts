import type { Item, Tag } from '../model/types';
import type { ExportFile, ImportedCard, ImportResult } from './types';
import { parseDate, splitTags } from './util';

// ponytail: frontmatter is "key: value", "key: [a, b]" and "- item" lists only; add a YAML dep if real vaults break it
export function parseFrontmatter(md: string): { meta: Record<string, string | string[]>; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: md };
  const meta: Record<string, string | string[]> = {};
  let key = '';
  for (const line of m[1]!.split(/\r?\n/)) {
    const li = line.match(/^\s*-\s+(.*)$/);
    if (li && key && Array.isArray(meta[key])) { (meta[key] as string[]).push(unq(li[1]!)); continue; }
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1]!;
    const v = kv[2]!.trim();
    if (v === '') meta[key] = [];
    else if (v.startsWith('[') && v.endsWith(']')) meta[key] = v.slice(1, -1).split(',').map((s) => unq(s.trim())).filter(Boolean);
    else meta[key] = unq(v);
  }
  return { meta, body: md.slice(m[0].length) };
}
const unq = (s: string) => (/^".*"$/s.test(s) ? s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\') : /^'.*'$/s.test(s) ? s.slice(1, -1) : s);
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v);

export function importObsidian(files: { path: string; content: string }[]): ImportResult {
  const cards: ImportedCard[] = [];
  for (const f of files) {
    if (!/\.md$/i.test(f.path)) continue;
    const { meta, body } = parseFrontmatter(f.content);
    const tags = Array.isArray(meta['tags']) ? meta['tags'].map((t) => t.replace(/^#/, '')) : splitTags(str(meta['tags']), /[,\s]+/);
    const card: ImportedCard = { type: 'note', tags, title: str(meta['title']) ?? f.path.replace(/^.*[\\/]/, '').replace(/\.md$/i, ''), sourceId: f.path };
    const text = body.trim();
    if (text) card.body = text;
    const url = str(meta['url']);
    if (url) { card.url = url; card.type = 'link'; }
    const createdAt = parseDate(str(meta['created']));
    if (createdAt !== undefined) card.createdAt = createdAt;
    cards.push(card);
  }
  return { cards, unmatchedFiles: [], warnings: [] };
}

const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function toObsidianVault(items: Item[], tags: Tag[]): ExportFile[] {
  const tagsOf = new Map<string, string[]>();
  for (const t of tags) if (!t.deleted_at) tagsOf.set(t.item_id, [...(tagsOf.get(t.item_id) ?? []), t.tag]);
  return items.filter((i) => !i.deleted_at).map((i) => {
    const fm = [`id: ${i.id}`, `type: ${i.type}`, `created: ${new Date(i.created_at).toISOString()}`];
    if (i.title) fm.push(`title: ${q(i.title)}`);
    if (i.url) fm.push(`url: ${q(i.url)}`);
    if (i.summary) fm.push(`summary: ${q(i.summary)}`);
    fm.push(`tags: [${(tagsOf.get(i.id) ?? []).map(q).join(', ')}]`);
    const slug = (i.title ?? i.type).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || i.type;
    return { path: `${slug}-${i.id.slice(0, 8)}.md`, content: `---\n${fm.join('\n')}\n---\n${i.body ?? ''}\n` };
  });
}
