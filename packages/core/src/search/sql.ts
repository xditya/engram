import type { Parsed } from './parse';

export type Sort = 'created' | 'updated' | 'opened';
export interface SearchOpts { limit?: number; offset?: number; sort?: Sort; now?: number }

export const BM25 = 'bm25(items_fts, 10, 1, 2, 2, 4, 1)';

export function buildSearchSql(p: Parsed, opts: SearchOpts = {}): { sql: string; params: unknown[] } {
  const { limit = 50, offset = 0, sort = 'created' } = opts;
  const where = [...p.where];
  const params: unknown[] = [];
  let from = 'items';
  if (p.ftsMatch !== null) {
    from = 'items JOIN items_fts ON items_fts.rowid = items.rowid';
    where.unshift('items_fts MATCH ?');
    params.push(p.ftsMatch);
  }
  params.push(...p.params);
  where.push(p.trash ? 'items.deleted_at IS NOT NULL' : 'items.deleted_at IS NULL');
  const order = p.ftsMatch !== null ? BM25 : `items.${sort}_at DESC`;
  // JS post-filters (named colors) must run before paging, so fetch everything and slice in run.ts.
  const page = p.post.length ? '' : ` LIMIT ${limit} OFFSET ${offset}`;
  return { sql: `SELECT items.* FROM ${from} WHERE ${where.join(' AND ')} ORDER BY ${order}${page}`, params };
}
