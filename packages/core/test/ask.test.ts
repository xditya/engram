import { describe, expect, it } from 'vitest';
import { memoryDb } from './helpers/db';
import type { Database } from '../src/platform';
import type { Provider } from '../src/ai/types';
import { ask, retrievalQuery, looksLikeQuestion, citations, contextBlock, unhedge, NOTHING_FOUND } from '../src/ai/ask';

const NOW = new Date(2026, 4, 25, 12).getTime();

function seed(db: Database, rows: { id: string; title: string; body?: string; ocr?: string; tags?: string[]; url?: string }[]) {
  for (const r of rows) {
    db.exec('INSERT INTO items (id, type, url, domain, title, body, ocr_text, created_at, updated_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [r.id, 'link', r.url ?? null, r.url ? new URL(r.url).hostname : null, r.title, r.body ?? null, r.ocr ?? null, NOW, NOW, 'dev']);
    for (const t of r.tags ?? []) db.exec('INSERT INTO tags (item_id, tag, source) VALUES (?,?,?)', [r.id, t, 'user']);
    db.exec('INSERT INTO items_fts (rowid, title, body, summary, ocr_text, tags, domain) SELECT rowid, ?, ?, ?, ?, ?, ? FROM items WHERE id = ?',
      [r.title, r.body ?? '', '', r.ocr ?? '', (r.tags ?? []).join(' '), r.url ? new URL(r.url).hostname : '', r.id]);
  }
}

const fakeProvider = (reply: string, seen: { system?: string; user?: string } = {}): Provider => ({
  id: 'openai',
  async complete(req) { seen.system = req.system; seen.user = req.user; return reply; },
  capabilities: () => ({ chat: true, embed: false, vision: false, summaries: true }),
  test: async () => ({ ok: true }),
});

const tagsOf = (db: Database) => (id: string) => db.query<{ tag: string }>('SELECT tag FROM tags WHERE item_id = ?', [id]).map((r) => r.tag);

describe('retrievalQuery', () => {
  it('drops filler and question words, keeps operators', () => {
    expect(retrievalQuery('What did I save about Claude Code websites?')).toBe('claude code websites');
    expect(retrievalQuery('summarise everything on dropshipping tag:business')).toBe('tag:business dropshipping');
    expect(retrievalQuery('show me')).toBe('');
  });
});

describe('looksLikeQuestion', () => {
  it('recognises questions and long queries, not lookups', () => {
    expect(looksLikeQuestion('fonts')).toBe(false);
    expect(looksLikeQuestion('which reel mentioned claude code?')).toBe(true);
    expect(looksLikeQuestion('summarise my notes on typography')).toBe(true);
    expect(looksLikeQuestion('best free fonts for a landing page')).toBe(true);
  });
});

describe('ask', () => {
  const db = memoryDb();
  seed(db, [
    { id: 'a', title: '@colinjryan on Instagram', url: 'https://www.instagram.com/reel/DYlectBtCDe/', ocr: 'Stop making boring websites with Claude Code', tags: ['claude code', 'web design'] },
    { id: 'b', title: 'Free fonts for designers', url: 'https://example.com/fonts', body: 'A list of open source typefaces: Inter, Geist, Space Grotesk.' },
    { id: 'c', title: 'Sourdough bread', body: 'flour water salt' },
  ]);

  it('retrieves by on-image text, cites the card, and hands the model only found cards', async () => {
    const seen: { system?: string; user?: string } = {};
    const r = await ask({ db, provider: fakeProvider('One reel says to stop making boring websites with Claude Code [1].', seen), tagsOf: tagsOf(db), now: NOW },
      'which reel mentioned claude code websites?');
    expect(r.cards.map((c) => c.id)).toContain('a');
    expect(r.cited).toEqual([0]);
    expect(r.empty).toBe(false);
    expect(seen.user).toContain('[1] @colinjryan on Instagram');
    expect(seen.user).toContain('on image: Stop making boring websites');
    expect(seen.user).not.toContain('Sourdough');
    expect(seen.system).toMatch(/cite/i);
  });

  it('answers nothing-found without calling the model when no card matches', async () => {
    let called = false;
    const p = fakeProvider('should not run');
    p.complete = async () => { called = true; return 'x'; };
    const r = await ask({ db, provider: p, tagsOf: tagsOf(db), now: NOW }, 'what did I save about quantum physics?');
    expect(called).toBe(false);
    expect(r.answer).toBe(NOTHING_FOUND);
    expect(r.empty).toBe(true);
  });

  it('falls back to single words when the whole question matches nothing', async () => {
    const r = await ask({ db, provider: fakeProvider('Fonts [1].'), tagsOf: tagsOf(db), now: NOW }, 'fonts and sourdough together?');
    expect(r.cards.map((c) => c.id).sort()).toEqual(['b', 'c']);
  });

  it('falls back to text search when the embedder throws', async () => {
    const boom = async () => { throw new Error('forward pass failed'); };
    const r = await ask({ db, provider: fakeProvider('Fonts [1].'), embedQuery: boom, tagsOf: tagsOf(db), now: NOW }, 'which fonts did i save?');
    expect(r.cards.map((c) => c.id)).toContain('b');
  });

  it('carries earlier turns into the prompt', async () => {
    const seen: { user?: string } = {};
    await ask({ db, provider: fakeProvider('ok', seen), tagsOf: tagsOf(db), now: NOW }, 'and which fonts were listed?', [{ role: 'user', content: 'what about fonts' }, { role: 'assistant', content: 'You saved a fonts list [1].' }]);
    expect(seen.user).toContain('Earlier in this conversation');
    expect(seen.user).toContain('User: what about fonts');
  });
});

describe('unhedge', () => {
  it('drops the not-found hedge when cards are cited, keeps a real not-found', () => {
    expect(unhedge("I couldn't find anything saved about that. The closest cards are [2] Lokesh Kanagaraj - Wikipedia.")).toBe('[2] Lokesh Kanagaraj - Wikipedia.');
    expect(unhedge("I couldn't find anything saved about that.")).toBe("I couldn't find anything saved about that.");
    expect(unhedge('One reel says so [1].')).toBe('One reel says so [1].');
  });
});

describe('citations / contextBlock', () => {
  it('parses [n] in order, ignoring out-of-range', () => {
    expect(citations('See [2] and [1], also [2] and [9].', 3)).toEqual([1, 0]);
  });
  it('clips long bodies and stops at the context budget', () => {
    const cards = Array.from({ length: 60 }, (_, i) => ({ id: String(i), type: 'note', title: `n${i}`, body: 'x'.repeat(5000), url: null, domain: null, summary: null, ocr_text: null, meta: null, colors: null, embedding: null, embedding_dim: null, embedding_model: null, pinned_at: null, opened_at: null, open_count: 0, resurfaced_at: null, let_go_at: null, deleted_at: null, created_at: NOW, updated_at: NOW, created_by: 'dev' }));
    const ctx = contextBlock(cards as never, () => []);
    expect(ctx.length).toBeLessThan(25_000);
    expect(ctx).toContain('[1] n0');
    expect(ctx).not.toContain('x'.repeat(601));
  });
});
