import type { Database } from '../platform';
import type { Item } from '../model/types';
import { OPERATORS, parse, type Parsed } from './parse';
import { buildSearchSql, type SearchOpts } from './sql';
import { cosineTopK } from './vector';
import { reciprocalRankFusion } from './rrf';

function runParsed(db: Database, p: Parsed, opts: SearchOpts): Item[] {
  const { sql, params } = buildSearchSql(p, opts);
  let rows = db.query<Item>(sql, params);
  if (p.post.length) {
    const offset = opts.offset ?? 0;
    rows = rows.filter((it) => p.post.every((f) => f(it))).slice(offset, offset + (opts.limit ?? 50));
  }
  return rows;
}

export function search(db: Database, query: string, opts: SearchOpts = {}): Item[] {
  return runParsed(db, parse(query, opts.now), opts);
}

export type EmbedQuery = (text: string) => Promise<{ vec: Float32Array; model: string } | null>;

// FTS hits fused (RRF) with the top-50 cosine neighbours that pass the same operator filters.
// Plain search when there are <2 plain words, no embedder, or no embeddings for that model.
export async function hybrid(db: Database, query: string, embedQuery?: EmbedQuery, opts: SearchOpts = {}): Promise<Item[]> {
  const p = parse(query, opts.now);
  if (!embedQuery || p.plainWords < 2) return runParsed(db, p, opts);
  const text = p.chips.filter((t) => !t.neg && t.kind !== 'op').map((t) => t.value).join(' ');
  const q = await embedQuery(text);
  if (!q) return runParsed(db, p, opts);
  const rows = db.query<{ id: string; vec: Uint8Array; model: string | null }>(
    'SELECT id, embedding AS vec, embedding_model AS model FROM items WHERE embedding IS NOT NULL AND embedding_model = ?', [q.model]);
  const vecIds = cosineTopK(q.vec, q.model, rows, 50).map((r) => r.id);
  if (!vecIds.length) return runParsed(db, p, opts);
  const limit = opts.limit ?? 50, offset = opts.offset ?? 0;
  const ftsIds = runParsed(db, p, { ...opts, limit: 50 + offset, offset: 0 }).map((i) => i.id);
  const filtered: Parsed = { ...p, ftsMatch: null, where: [...p.where, `items.id IN (${vecIds.map(() => '?').join(',')})`], params: [...p.params, ...vecIds] };
  const allowed = new Set(runParsed(db, filtered, { limit: 50, offset: 0 }).map((i) => i.id));
  const ranked = reciprocalRankFusion([ftsIds, vecIds.filter((id) => allowed.has(id))]).slice(offset, offset + limit);
  if (!ranked.length) return [];
  const byId = new Map(db.query<Item>(`SELECT * FROM items WHERE id IN (${ranked.map(() => '?').join(',')})`, ranked).map((i) => [i.id, i]));
  return ranked.flatMap((id) => byId.get(id) ?? []);
}

export interface Suggestion { kind: 'tag' | 'site' | 'operator'; text: string }

const TAGS_LIKE = 'SELECT DISTINCT tag FROM tags WHERE deleted_at IS NULL AND tag LIKE ? ORDER BY tag LIMIT ?';

export function suggest(db: Database, prefix: string, limit = 10): Suggestion[] {
  const word = prefix.split(/\s+/).pop() ?? '';
  const out: Suggestion[] = [];
  const tags = (p: string) => { for (const r of db.query<{ tag: string }>(TAGS_LIKE, [`${p}%`, limit])) out.push({ kind: 'tag', text: `#${r.tag}` }); };
  if (word.startsWith('#') || word.startsWith('tag:')) tags(word.replace(/^(#|tag:)/, ''));
  else if (word.startsWith('site:')) {
    for (const r of db.query<{ domain: string }>('SELECT DISTINCT domain FROM items WHERE deleted_at IS NULL AND domain LIKE ? ORDER BY domain LIMIT ?', [`${word.slice(5)}%`, limit]))
      out.push({ kind: 'site', text: `site:${r.domain}` });
  } else if (word) {
    for (const op of OPERATORS) if (op.startsWith(word.toLowerCase())) out.push({ kind: 'operator', text: `${op}:` });
    tags(word);
  }
  return out.slice(0, limit);
}
