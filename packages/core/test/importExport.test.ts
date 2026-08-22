import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Item, Tag } from '../src/model/types';
import {
  buildExportBundle, dedupKey, detectFormat, fromEngramJson, importMymind, importNetscape, importObsidian, importPocket,
  importRaindrop, normalizeUrl, parseCsv, stringifyCsv, toCardsCsv, toEngramJson, toObsidianVault,
} from '../src/importExport';

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', 'importExport', name), 'utf8');

const item = (p: Partial<Item>): Item => ({
  id: '018f0000-0000-7000-8000-000000000001', type: 'note', url: null, domain: null, title: null, body: null, summary: null, ocr_text: null,
  meta: null, colors: null, embedding: null, embedding_dim: null, embedding_model: null, pinned_at: null, opened_at: null, open_count: 0,
  resurfaced_at: null, let_go_at: null, deleted_at: null, created_at: 1700000000000, updated_at: 1700000001000, created_by: 'dev1', ...p,
});

describe('csv', () => {
  it('handles quotes, embedded newlines, CRLF and round-trips', () => {
    const rows = [['a', 'b'], ['say "hi"', 'line1\nline2'], ['x,y', '']];
    expect(parseCsv(stringifyCsv(rows))).toEqual(rows);
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('"multi\r\nline",2')).toEqual([['multi\r\nline', '2']]);
  });
});

describe('importers', () => {
  it('mymind: loose columns, types, file matching, warnings', () => {
    const r = importMymind(fx('mymind-cards.csv'), ['a1.txt', 'c3.png', 'zz.pdf']);
    expect(r.warnings).toEqual(['ignored columns: color']);
    expect(r.unmatchedFiles).toEqual(['zz.pdf']);
    expect(r.cards.map((c) => c.type)).toEqual(['note', 'link', 'image', 'quote']);
    expect(r.cards[0]).toMatchObject({ title: 'Shopping', body: 'Milk, eggs\nand "bread"', tags: ['home', 'errands'], createdAt: Date.parse('2024-03-01T10:00:00Z'), fileRef: 'a1.txt', sourceId: 'a1' });
    expect(r.cards[2]).toMatchObject({ fileRef: 'c3.png', createdAt: 1709380800000 });
    expect(r.cards[3]).toMatchObject({ url: 'https://example.com/q', body: 'To be or not' });
  });

  it('raindrop: folder tag and highlight quote cards', () => {
    const { cards } = importRaindrop(fx('raindrop.csv'));
    expect(cards.map((c) => c.type)).toEqual(['link', 'quote', 'quote', 'link']);
    expect(cards[0]).toMatchObject({ title: 'Deep Work', body: 'my note', tags: ['focus', 'books', 'raindrop/Reading'], sourceId: '101' });
    expect(cards[1]).toMatchObject({ body: 'First highlight', url: 'https://example.com/deep', sourceId: '101' });
    expect(cards[3]).toMatchObject({ body: 'Only excerpt', tags: [] });
  });

  it('pocket: pipe tags, archive tag, unix seconds', () => {
    const { cards } = importPocket(fx('pocket.csv'));
    expect(cards[0]).toMatchObject({ type: 'link', title: 'Pocket one', tags: ['a', 'b'], createdAt: 1700000000000 });
    expect(cards[1]!.tags).toEqual(['archived']);
  });

  it('netscape: folder paths, entities, skip folders', () => {
    const { cards } = importNetscape(fx('bookmarks.html'));
    expect(cards.map((c) => [c.url, c.tags])).toEqual([
      ['https://example.com/bar', ['Bookmarks bar']],
      ['https://example.com/js?a=1&b=2', ['lang', 'web', 'Dev/JS']],
      ['https://example.com/dev', ['Dev']],
      ['https://example.com/top', []],
    ]);
    expect(cards[1]).toMatchObject({ title: "Tom & Jerry's JS", createdAt: 1700000002000 });
    expect(importNetscape(fx('bookmarks.html'), { skipFolders: ['bookmarks bar'] }).cards).toHaveLength(3);
  });

  it('obsidian: frontmatter tags, [[links]] kept', () => {
    const { cards } = importObsidian([{ path: 'daily/note.md', content: fx('note.md') }, { path: 'x.png', content: '' }]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ type: 'note', title: 'Morning pages', tags: ['journal', 'ideas'], createdAt: Date.parse('2024-01-05T08:00:00Z') });
    expect(cards[0]!.body).toContain('[[Other note]]');
  });

  it('detectFormat', () => {
    expect(detectFormat('cards.csv', fx('mymind-cards.csv').slice(0, 200))).toBe('mymind');
    expect(detectFormat('x.csv', fx('raindrop.csv').slice(0, 200))).toBe('raindrop');
    expect(detectFormat('part_000000.csv', fx('pocket.csv').slice(0, 200))).toBe('pocket');
    expect(detectFormat('bookmarks_8_22_26.html', fx('bookmarks.html').slice(0, 200))).toBe('netscape');
    expect(detectFormat('note.md', '')).toBe('obsidian');
    expect(detectFormat('engram.json', '{\n  "engram": 1,')).toBe('engram');
    expect(detectFormat('other.json', '{"a":1}')).toBeNull();
  });
});

describe('export', () => {
  const items = [
    item({ id: '018f0000-0000-7000-8000-000000000001', type: 'link', url: 'https://example.com/a', domain: 'example.com', title: 'A "quoted" title', body: 'line1\nline2', summary: 'sum', embedding: new Uint8Array([1, 2, 3, 250, 255]), embedding_dim: 1, embedding_model: 'm', meta: '{"price":1}' }),
    item({ id: '018f0000-0000-7000-8000-000000000002', type: 'note', body: 'hello', deleted_at: 5 }),
  ];
  const tags: Tag[] = [
    { item_id: items[0]!.id, tag: 'user tag', source: 'user', deleted_at: null },
    { item_id: items[0]!.id, tag: 'ai/one', source: 'ai', deleted_at: null },
    { item_id: items[0]!.id, tag: 'gone', source: 'ai', deleted_at: 1 },
  ];

  it('engram.json round-trips losslessly (embedding included)', () => {
    const data = { items, tags, spaces: [{ id: 's1', name: 'S', query: 'tag:x', sort: 1, deleted_at: null }], spaceItems: [{ space_id: 's1', item_id: items[0]!.id, added_at: 1, deleted_at: null }], files: [{ hash: 'h1', item_id: items[0]!.id, role: 'original' as const, mime: 'image/png', bytes: 3, w: 1, h: 1, blurhash: null, deleted_at: null }] };
    const back = fromEngramJson(toEngramJson(data));
    expect(back).toEqual(data);
    expect(() => fromEngramJson('{"engram":99}')).toThrow();
  });

  it('cards.csv includes ai tags + summary, skips deleted, and re-imports via importMymind', () => {
    const csv = toCardsCsv(items, tags);
    expect(csv.split('\r\n')[0]).toBe('id,type,title,url,domain,body,summary,tags,ai_tags,created,updated');
    const { cards, warnings } = importMymind(csv);
    expect(warnings).toEqual([]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ type: 'link', title: 'A "quoted" title', url: 'https://example.com/a', body: 'line1\nline2', tags: ['user tag', 'ai/one'], createdAt: 1700000000000, sourceId: items[0]!.id });
  });

  it('obsidian vault round-trips through importObsidian', () => {
    const vault = toObsidianVault(items, tags);
    expect(vault).toHaveLength(1);
    expect(vault[0]!.path).toBe('a-quoted-title-018f0000.md');
    const { cards } = importObsidian(vault.map((f) => ({ path: f.path, content: f.content as string })));
    expect(cards[0]).toMatchObject({ type: 'link', title: 'A "quoted" title', url: 'https://example.com/a', body: 'line1\nline2', tags: ['user tag', 'ai/one'], createdAt: 1700000000000 });
  });

  it('bundle lists json, csv, notes and known blobs', () => {
    const files = [{ hash: 'h1', item_id: items[0]!.id, role: 'original' as const, mime: 'image/png', bytes: 1, w: null, h: null, blurhash: null, deleted_at: null }, { hash: 'h2', item_id: items[0]!.id, role: 'thumb' as const, mime: null, bytes: 1, w: null, h: null, blurhash: null, deleted_at: null }];
    const paths = buildExportBundle({ items, tags, files }, { h1: new Uint8Array([1]) }).map((f) => f.path);
    expect(paths).toEqual(['engram.json', 'cards.csv', 'notes/a-quoted-title-018f0000.md', 'files/h1.png']);
  });
});

describe('dedupKey', () => {
  it('normalises urls', () => {
    expect(normalizeUrl('HTTPS://Example.COM/path/?utm_source=a&b=2&fbclid=x#frag')).toBe('https://example.com/path/?b=2');
    expect(normalizeUrl('https://example.com/path/#x')).toBe('https://example.com/path');
    expect(dedupKey('https://example.com/a?utm_medium=m')).toBe(dedupKey('https://EXAMPLE.com/a/'));
    expect(dedupKey(null, 'abc')).toBe('hash:abc');
    expect(dedupKey(null, null)).toBeNull();
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});
