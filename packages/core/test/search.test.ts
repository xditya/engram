import { describe, expect, it } from 'vitest';
import { memoryDb } from './helpers/db';
import type { Database } from '../src/platform';
import { search, suggest, hybrid, parse, parseDate, cosineTopK, encodeVec, decodeVec, reciprocalRankFusion } from '../src/search';

const DAY = 86_400_000;
const NOW = new Date(2026, 4, 25, 12).getTime(); // local May 25 2026 noon

type Seed = { id: string; type?: string; title?: string; body?: string; ocr?: string; domain?: string; tags?: string[]; colors?: string[]; created?: number; pinned?: boolean; deleted?: boolean; vec?: number[] };

function seed(db: Database, rows: Seed[]) {
  for (const r of rows) {
    db.exec('INSERT INTO items (id, type, domain, title, body, ocr_text, colors, embedding, embedding_model, pinned_at, deleted_at, created_at, updated_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [r.id, r.type ?? 'note', r.domain ?? null, r.title ?? null, r.body ?? null, r.ocr ?? null, r.colors ? JSON.stringify(r.colors) : null,
        r.vec ? encodeVec(Float32Array.from(r.vec)) : null, r.vec ? 'm1' : null, r.pinned ? NOW : null, r.deleted ? NOW : null, r.created ?? NOW, NOW, 'dev']);
    for (const t of r.tags ?? []) db.exec('INSERT INTO tags (item_id, tag, source) VALUES (?,?,?)', [r.id, t, 'user']);
    db.exec('INSERT INTO items_fts (rowid, title, body, summary, ocr_text, tags, domain) SELECT rowid, ?, ?, ?, ?, ?, ? FROM items WHERE id = ?',
      [r.title ?? '', r.body ?? '', '', r.ocr ?? '', (r.tags ?? []).join(' '), r.domain ?? '', r.id]);
  }
}

function fixture() {
  const db = memoryDb();
  seed(db, [
    { id: 'a', type: 'article', title: 'Sourdough bread recipe', body: 'flour water salt', domain: 'kingarthur.com', tags: ['baking', 'food'], created: NOW - 2 * DAY, colors: ['#c0392b'] },
    { id: 'b', type: 'link', title: 'Brewing coffee at home', body: 'grind beans fresh', domain: 'blog.coffee.com', tags: ['coffee'], created: NOW - 10 * DAY, pinned: true, colors: ['#2980b9'] },
    { id: 'c', type: 'image', title: 'kitchen photo', ocr: 'bread flour bag', tags: ['baking'], created: NOW - 40 * DAY, colors: ['#2ecc71'] },
    { id: 'd', type: 'note', title: 'old bread', body: 'trashed note about bread', tags: [], created: NOW - DAY, deleted: true },
    { id: 'e', type: 'note', title: 'Weekend plans', body: 'bake bread "for real"', created: new Date(2026, 4, 19, 9).getTime() },
  ]);
  db.exec("INSERT INTO spaces (id, name) VALUES ('s1', 'Kitchen')");
  db.exec("INSERT INTO space_items (space_id, item_id) VALUES ('s1', 'a'), ('s1', 'c')");
  return db;
}

const ids = (db: Database, q: string) => search(db, q, { now: NOW }).map((i) => i.id).sort();

describe('parse', () => {
  it('builds FTS match with prefix on the last word and quoted phrases', () => {
    const p = parse('sour bread "flour water" tag:baking', NOW);
    expect(p.ftsMatch).toBe('"sour" AND "bread"* AND "flour water"');
    expect(p.chips.map((c) => c.kind)).toEqual(['word', 'word', 'phrase', 'op']);
  });
  it('treats unknown operators as plain text', () => {
    expect(parse('foo:bar', NOW).ftsMatch).toBe('"foo:bar"*');
  });
  it('parses natural dates', () => {
    expect(parseDate('may 19th', NOW)).toEqual([new Date(2026, 4, 19).getTime(), new Date(2026, 4, 20).getTime()]);
    expect(parseDate('2026-05-19', NOW)![0]).toBe(new Date(2026, 4, 19).getTime());
    expect(parseDate('yesterday', NOW)![0]).toBe(new Date(2026, 4, 24).getTime());
    expect(parseDate('last week', NOW)![0]).toBe(new Date(2026, 4, 18).getTime());
    expect(parseDate('nope', NOW)).toBeNull();
  });
});

describe('search', () => {
  const db = fixture();
  it('prefix + phrase + negation', () => {
    expect(ids(db, 'brea')).toEqual(['a', 'c', 'e']);
    expect(ids(db, '"flour water"')).toEqual(['a']);
    expect(ids(db, 'bread -flour')).toEqual(['e']);
    expect(ids(db, '-bread')).toEqual(['b']);
    expect(ids(db, 'bread -#baking')).toEqual(['e']);
  });
  it('ranks title matches above body/ocr', () => {
    expect(search(db, 'bread', { now: NOW })[0]!.id).toBe('a');
  });
  it('operators', () => {
    expect(ids(db, '#baking')).toEqual(['a', 'c']);
    expect(ids(db, 'tag:Coffee')).toEqual(['b']);
    expect(ids(db, 'type:image')).toEqual(['c']);
    expect(ids(db, '-type:note')).toEqual(['a', 'b', 'c']);
    expect(ids(db, 'site:coffee.com')).toEqual(['b']);
    expect(ids(db, 'text:bread')).toEqual(['c', 'e']); // title-only match 'a' excluded
    expect(ids(db, 'color:#c0392b')).toEqual(['a']);
    expect(ids(db, 'color:red')).toEqual(['a']);
    expect(ids(db, 'color:green')).toEqual(['c']);
    expect(ids(db, 'is:pinned')).toEqual(['b']);
    expect(ids(db, 'is:trash')).toEqual(['d']);
    expect(ids(db, 'has:note')).toEqual(['a', 'b', 'e']);
    expect(ids(db, 'in:kitchen')).toEqual(['a', 'c']);
    expect(ids(db, 'in:s1 -type:image')).toEqual(['a']);
  });
  it('dates', () => {
    expect(ids(db, 'after:"last week"')).toEqual(['a', 'e']);
    expect(ids(db, 'before:"last week"')).toEqual(['b', 'c']);
    expect(ids(db, 'on:"may 19"')).toEqual(['e']);
    expect(ids(db, 'on:2026-05-19')).toEqual(['e']);
    expect(ids(db, 'after:"last month"')).toEqual(['a', 'b', 'e']);
  });
  it('no query lists everything by created_at desc, paged', () => {
    expect(search(db, '', { now: NOW }).map((i) => i.id)).toEqual(['a', 'e', 'b', 'c']);
    expect(search(db, '', { now: NOW, limit: 2, offset: 1 }).map((i) => i.id)).toEqual(['e', 'b']);
  });
  it('suggest', () => {
    expect(suggest(db, 'bread #ba').map((s) => s.text)).toEqual(['#baking']);
    expect(suggest(db, 'site:bl').map((s) => s.text)).toEqual(['site:blog.coffee.com']);
    expect(suggest(db, 'ty').map((s) => s.text)).toEqual(['type:']);
    expect(suggest(db, 'co').map((s) => s.text)).toEqual(['color:', '#coffee']);
  });
});

describe('vector + rrf', () => {
  it('round-trips vectors and ranks by cosine within the same model', () => {
    const v = Float32Array.from([0.1, -2, 3.5]);
    expect([...decodeVec(encodeVec(v))]).toEqual([...v]);
    const rows = [
      { id: 'x', vec: encodeVec(Float32Array.from([1, 0, 0])), model: 'm1' },
      { id: 'y', vec: encodeVec(Float32Array.from([0.9, 0.1, 0])), model: 'm1' },
      { id: 'z', vec: encodeVec(Float32Array.from([1, 0, 0])), model: 'other' },
    ];
    expect(cosineTopK(Float32Array.from([1, 0, 0]), 'm1', rows, 5).map((r) => r.id)).toEqual(['x', 'y']);
  });
  it('rrf fuses lists', () => {
    expect(reciprocalRankFusion([['a', 'b', 'c'], ['c', 'a']])).toEqual(['a', 'c', 'b']);
  });
  it('hybrid pulls in vector-only hits and respects filters', async () => {
    const db = memoryDb();
    seed(db, [
      { id: 'f', title: 'crusty loaf tips', body: 'bread', vec: [1, 0], type: 'note' },
      { id: 'g', title: 'nothing in fts', vec: [0.95, 0.05], type: 'note' },
      { id: 'h', title: 'filtered out by type', vec: [0.99, 0.01], type: 'image' },
    ]);
    const embed = async () => ({ vec: Float32Array.from([1, 0]), model: 'm1' });
    const res = await hybrid(db, 'crusty loaf type:note', embed, { now: NOW });
    expect(res.map((i) => i.id)).toEqual(['f', 'g']);
    // single word: plain FTS only
    expect((await hybrid(db, 'crusty', embed, { now: NOW })).map((i) => i.id)).toEqual(['f']);
  });
});
