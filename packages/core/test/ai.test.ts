import { describe, expect, it } from 'vitest';
import { PRESETS, createProvider } from '../src/ai/providers';
import { memoryDb } from './helpers/db';
import type { Item, IntelligenceSettings, Job } from '../src/model/types';
import {
  anthropic, gemini, openaiCompatible, createProvider, createEmbedder, classify, embed, describeImage, blobToVec,
  estimateCost, estimateTokens, createQueue, classifyPrompt, weakTitle, type Fetch, type Provider,
} from '../src/ai';

type Call = { url: string; init: any; body: any };
function fakeFetch(reply: (c: Call) => unknown, status = 200) {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    const c = { url, init, body: init?.body ? JSON.parse(init.body) : null };
    calls.push(c);
    const out = reply(c);
    return { ok: status < 400, status, text: async () => (typeof out === 'string' ? out : JSON.stringify(out)) };
  };
  return { fetch, calls };
}

const item = (over: Partial<Item> = {}): Item => ({
  id: 'i1', type: 'link', url: 'https://example.com/a', domain: 'example.com', title: 'Sourdough basics', body: 'Flour, water, salt.'.repeat(300),
  summary: null, ocr_text: null, meta: null, colors: null, embedding: null, embedding_dim: null, embedding_model: null,
  pinned_at: null, opened_at: null, open_count: 0, resurfaced_at: null, let_go_at: null, deleted_at: null, created_at: 1, updated_at: 1, created_by: 'd1', ...over,
});

describe('providers', () => {
  it('anthropic: messages request shape, fenced json parsed, no embed', async () => {
    const { fetch, calls } = fakeFetch(() => ({ content: [{ type: 'text', text: 'Sure:\n```json\n{"type":"recipe","tags":["Bread"," sourdough"],"summary":"Bread."}\n```' }] }));
    const p = anthropic({ apiKey: 'k', fetch });
    const patch = await classify(p, item());
    expect(patch).toEqual({ type: 'recipe', tags: ['bread', 'sourdough'], summary: 'Bread.' });
    const c = calls[0]!;
    expect(c.url).toBe('https://api.anthropic.com/v1/messages');
    expect(c.init.headers['anthropic-version']).toBe('2023-06-01');
    expect(c.init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(c.init.headers['x-api-key']).toBe('k');
    expect(c.body.messages[0].content[0].text).toContain('Sourdough basics');
    expect(c.body.system).toContain('single JSON object');
    expect(p.embed).toBeUndefined();
  });

  it('gemini: json mime type, inlineData vision, batch embeddings 768', async () => {
    const { fetch, calls } = fakeFetch((c) => c.url.includes('batchEmbedContents')
      ? { embeddings: [{ values: Array(768).fill(0.5) }] }
      : { candidates: [{ content: { parts: [{ text: '{"summary":"A loaf","tags":["bread"]}' }] } }] });
    const p = gemini({ apiKey: 'g', fetch });
    const d = await describeImage(p, item({ type: 'image', meta: '{"w":1}' }), { image: { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' } });
    expect(d).toEqual({ summary: 'A loaf', tags: ['bread'], meta: '{"w":1,"caption":"A loaf"}' });
    expect(calls[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
    expect(calls[0]!.init.headers['x-goog-api-key']).toBe('g');
    expect(calls[0]!.body.generationConfig.responseMimeType).toBe('application/json');
    expect(calls[0]!.body.contents[0].parts[0].inlineData).toEqual({ mimeType: 'image/png', data: 'AQID' });
    const e = await embed(p, item());
    expect(e.embedding_dim).toBe(768);
    expect(e.embedding_model).toBe('gemini-embedding-001');
    expect(blobToVec(e.embedding)[3]).toBeCloseTo(0.5);
    expect(calls[1]!.body.requests[0].model).toBe('models/gemini-embedding-001');
  });

  it('openai-compatible: response_format on presets that support it, bearer key, embeddings ordered, models test', async () => {
    const { fetch, calls } = fakeFetch((c) => {
      if (c.url.endsWith('/models')) return { data: [{ id: 'm1' }] };
      if (c.url.endsWith('/embeddings')) return { data: [{ index: 1, embedding: [2, 2] }, { index: 0, embedding: [1, 1] }] };
      return { choices: [{ message: { content: '{"type":"link","tags":["xylophone"]}' } }] };
    });
    const p = openaiCompatible({ id: 'openai', apiKey: 'o', fetch });
    await classify(p, item(), { summaries: false });
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0]!.init.headers.authorization).toBe('Bearer o');
    expect(calls[0]!.body.response_format).toEqual({ type: 'json_object' });
    expect(calls[0]!.body.messages[0].content).not.toContain('single JSON object');
    const { vectors } = await p.embed!(['a', 'b']);
    expect([...vectors[0]!]).toEqual([1, 1]);
    expect(await p.test()).toEqual({ ok: true, models: ['m1'] });

    const lm = openaiCompatible({ id: 'lmstudio', fetch, baseUrl: 'http://10.0.0.2:1234/v1/' });
    await lm.complete({ system: 's', user: 'u', json: true, maxTokens: 10 });
    const c = calls.at(-1)!;
    expect(c.url).toBe('http://10.0.0.2:1234/v1/chat/completions');
    expect(c.body.response_format).toBeUndefined();
    expect(c.body.messages[0].content).toContain('single JSON object');
    expect(c.init.headers.authorization).toBeUndefined();
  });

  it('test() reports http failures', async () => {
    const { fetch } = fakeFetch(() => 'nope', 401);
    expect(await anthropic({ apiKey: 'k', fetch }).test()).toEqual({ ok: false, reason: 'HTTP 401: nope' });
  });

  it('createProvider honours mode, key presence and on-device availability', () => {
    const fetch = fakeFetch(() => ({})).fetch;
    const base: IntelligenceSettings = { mode: 'key', provider: 'anthropic', summaries: true, describeImages: false };
    expect(createProvider({ ...base, mode: 'off' }, { apiKey: 'k' }, { fetch })).toBeNull();
    expect(createProvider(base, {}, { fetch })).toBeNull();
    expect(createProvider(base, { apiKey: 'k' }, { fetch })?.id).toBe('anthropic');
    expect(createProvider({ ...base, provider: 'ollama' }, {}, { fetch })?.id).toBe('ollama');
    expect(createProvider({ ...base, mode: 'on-device' }, {}, { fetch })).toBeNull();
    const od = { complete: async () => '', embed: async () => [new Float32Array(384)], ready: async () => true };
    const main = createProvider(base, { apiKey: 'k' }, { fetch })!;
    expect(createEmbedder(base, main, {})).toBeNull();
    expect(createEmbedder({ ...base, embedProvider: 'on-device' }, main, { onDevice: od })?.id).toBe('on-device');
  });

  it('classify prompt carries user instructions and corrections; on-device drops summaries', async () => {
    const s = classifyPrompt({ summaries: true, instructions: 'Prefer french tags', corrections: [{ title: 'Pain', tags: ['boulangerie'] }] });
    expect(s).toContain('Prefer french tags');
    expect(s).toContain('"Pain" -> boulangerie');
    expect(s).toContain('summary');
    const od: Provider = { id: 'on-device', capabilities: () => ({ chat: true, embed: true, vision: false, summaries: false }), test: async () => ({ ok: true }),
      complete: async (r) => { expect(r.system).not.toContain('summary'); return '{"type":"link","tags":["astronomy"],"summary":"ignored"}'; } };
    expect(await classify(od, item())).toEqual({ tags: ['astronomy'] });
  });
});

describe('cost', () => {
  it('estimates', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateCost(1840, 6000, 'anthropic', 'claude-3-5-haiku-latest').usd).toBeCloseTo(1840 * (1500 * 0.8 + 120 * 4) / 1e6, 6);
    expect(estimateCost(10, 6000, 'on-device', 'x')).toEqual({ usd: 0, seconds: 60 });
    expect(estimateCost(10, 6000, 'ollama', 'x').usd).toBe(0);
    expect(estimateCost(1, 4000, 'openrouter', 'unknown/model').usd).toBeGreaterThan(0);
  });
});

describe('queue', () => {
  function setup(over: Partial<Parameters<typeof createQueue>[0]> = {}) {
    const db = memoryDb();
    let t = 1_000_000;
    const items = new Map<string, Item>([['i1', item()]]);
    const updates: any[] = [], tags: any[] = [];
    let provider: Provider | null = null;
    let settings: IntelligenceSettings = { mode: 'off', summaries: true, describeImages: false };
    const q = createQueue({
      db, now: () => t, provider: () => provider, settings: () => settings,
      platform: { files: { read: async () => new Uint8Array(), path: (h) => h } },
      writer: {
        update: (id, p) => { updates.push([id, p]); items.set(id, { ...items.get(id)!, ...p }); },
        addTags: (id, ts) => tags.push([id, ts]), getItem: (id) => items.get(id) ?? null, filesOf: () => [],
      },
      ...over,
    });
    const jobs = () => db.query<Job>('SELECT * FROM jobs ORDER BY created_at, kind');
    return { db, q, jobs, updates, tags, setProvider: (p: Provider | null) => { provider = p; }, setSettings: (s: IntelligenceSettings) => { settings = s; }, advance: (ms: number) => { t += ms; } };
  }
  const okProvider = (over: Partial<Provider> = {}): Provider => ({
    id: 'openai', capabilities: () => ({ chat: true, embed: true, vision: true, summaries: true }), test: async () => ({ ok: true }),
    complete: async () => '{"type":"recipe","tags":["bread"],"summary":"S"}',
    embed: async () => ({ vectors: [new Float32Array([1, 2])], model: 'm', dim: 2 }), ...over,
  });

  it('skips provider jobs while off, re-enqueues and completes when a provider appears', async () => {
    const s = setup();
    s.q.enqueueFor('i1', ['classify', 'embed']);
    s.q.enqueueFor('i1', ['classify']); // duplicate: ignored while the first is pending
    expect(await s.q.tick()).toBe(1); // embed waits for classify to settle
    expect(await s.q.tick()).toBe(1);
    expect(s.jobs().map((j) => j.status)).toEqual(['skipped', 'skipped']);
    expect(s.jobs()[0]!.error).toBe('no provider');
    s.setProvider(okProvider());
    s.setSettings({ mode: 'key', provider: 'openai', summaries: true, describeImages: false });
    expect(s.q.reenqueueSkipped()).toBe(2);
    expect(await s.q.tick()).toBe(1);
    expect(await s.q.tick()).toBe(1);
    expect(await s.q.tick()).toBe(0);
    expect(s.jobs().map((j) => j.status)).toEqual(['done', 'done']);
    expect(s.updates[0]).toEqual(['i1', { type: 'recipe', summary: 'S' }]);
    expect(s.tags).toEqual([['i1', ['bread']]]);
    const e = s.updates[1]![1];
    expect(e.embedding_dim).toBe(2);
    expect(e.embedding_model).toBe('m');
  });

  it('backs off 2^n*30s and fails after 5 attempts; retry revives', async () => {
    const s = setup({ handlers: { extract: async () => { throw new Error('boom'); } } });
    s.q.enqueueFor('i1', ['extract']);
    await s.q.tick();
    let j = s.jobs()[0]!;
    expect(j.status).toBe('pending');
    expect(j.attempts).toBe(1);
    expect(j.error).toBe('boom');
    expect(j.run_after).toBe(1_000_000 + 60_000);
    expect(await s.q.tick()).toBe(0); // not due yet
    for (let n = 2; n <= 5; n++) { s.advance(2 ** n * 30_000); expect(await s.q.tick()).toBe(1); }
    j = s.jobs()[0]!;
    expect(j.status).toBe('failed');
    expect(j.attempts).toBe(5);
    s.q.retry(j.id);
    expect(s.jobs()[0]!.status).toBe('pending');
  });

  it('ocr uses platform.ocr when present, skipped otherwise; pause stops ticks; concurrency 1 on-device', async () => {
    const s = setup();
    s.q.enqueueFor('i1', ['ocr']);
    await s.q.tick();
    expect(s.jobs()[0]!.status).toBe('skipped');

    const s2 = setup({ platform: { ocr: async (p) => `text from ${p}`, files: { read: async () => new Uint8Array(), path: (h) => `/f/${h}` } },
      writer: { update: (id, p) => s2.updates.push([id, p]), addTags: () => {}, getItem: () => item(), filesOf: () => [{ hash: 'h1', role: 'original', mime: 'image/png' }] } });
    s2.q.enqueueFor('i1', ['ocr', 'classify', 'embed']);
    s2.q.pause();
    expect(await s2.q.tick()).toBe(0);
    s2.q.resume();
    s2.setProvider(okProvider({ id: 'on-device' }));
    expect(await s2.q.tick()).toBe(1);
    expect(s2.updates[0]).toEqual(['i1', { ocr_text: 'text from /f/h1' }]);
    expect(await s2.q.tick()).toBe(1);
    expect(await s2.q.tick()).toBe(1);
  });

  it('budget: paid jobs skipped with reason once the monthly cap is reached, spend booked on success', async () => {
    let spent = 0;
    const s = setup({ spent: () => spent, onSpend: (u) => { spent += u; }, concurrency: 1 });
    s.setProvider(okProvider());
    s.setSettings({ mode: 'key', provider: 'openai', chatModel: 'gpt-4o', summaries: true, describeImages: false, monthlyBudgetUsd: 0.004 });
    s.q.enqueueFor('i1', ['classify']);
    await s.q.tick();
    s.q.enqueueFor('i1', ['classify']);
    await s.q.tick();
    const st = s.jobs().map((j) => [j.status, j.error]);
    expect(st[0]).toEqual(['done', null]);
    expect(spent).toBeGreaterThan(0);
    expect(st[1]).toEqual(['skipped', 'budget: monthly cap reached']);
  });

  it('describe_image respects the setting and the vision capability', async () => {
    const s = setup({ writer: { update: () => {}, addTags: () => {}, getItem: () => item({ type: 'image' }), filesOf: () => [{ hash: 'h', role: 'thumb', mime: 'image/jpeg' }] } });
    s.setProvider(okProvider({ capabilities: () => ({ chat: true, embed: false, vision: false, summaries: true }) }));
    s.setSettings({ mode: 'key', summaries: true, describeImages: false });
    s.q.enqueueFor('i1', ['describe_image']);
    await s.q.tick();
    expect(s.jobs()[0]!.error).toBe('describeImages off');
    s.setSettings({ mode: 'key', summaries: true, describeImages: true });
    s.q.reenqueueSkipped();
    await s.q.tick();
    expect(s.jobs()[0]!.error).toBe('provider has no vision');
    s.setProvider(okProvider({ complete: async (r) => { expect(r.images?.[0]?.mime).toBe('image/jpeg'); return '{"summary":"pic","tags":["t"]}'; } }));
    s.q.reenqueueSkipped();
    await s.q.tick();
    expect(s.jobs()[0]!.status).toBe('done');
  });
});

describe('weakTitle', () => {
  const w = (title: string | null, body: string | null = null, domain: string | null = null) => weakTitle({ title, body, domain });
  it('placeholders are weak', () => {
    expect(w(null)).toBe(true);
    expect(w('example.com', null, 'example.com')).toBe(true);
    expect(w('IMG_2041.jpg')).toBe(true);
    expect(w('Screenshot 2026')).toBe(true);
    expect(w('Things to remember for the trip and')).toBe(true);
    expect(w('Groceries:')).toBe(true);
    expect(w('x'.repeat(80))).toBe(true);
  });
  it('real titles are kept', () => {
    expect(w('Sourdough basics')).toBe(false);
    expect(w('Groceries', 'Groceries\nmilk\neggs')).toBe(false);
    expect(w('Trip notes.', 'Trip notes.\nmore')).toBe(false);
  });
  it('classify replaces only a weak title', async () => {
    const { fetch } = fakeFetch(() => ({ content: [{ type: 'text', text: '{"type":"note","tags":["a"],"title":"Trip packing list"}' }] }));
    const p = anthropic({ apiKey: 'k', fetch });
    expect((await classify(p, item({ title: 'IMG_1.jpg', domain: null }))).title).toBe('Trip packing list');
    expect((await classify(p, item())).title).toBeUndefined();
  });
});

describe('presets', () => {
  it('offers embeddings only where the provider actually has them', () => {
    // OpenRouter proxies chat; POST /embeddings hits a dashboard route that answers 401, which reads as a bad key.
    expect(PRESETS.openrouter.embedModel).toBeUndefined();
    expect(PRESETS.groq.embedModel).toBeUndefined();
    expect(PRESETS.nvidia.embedModel).toBe('nvidia/nemotron-3-embed-1b');
  });

  it('builds an nvidia provider that can chat and embed', () => {
    const p = createProvider({ mode: 'key', provider: 'nvidia', summaries: true }, { apiKey: 'nvapi-x' }, { fetch: (async () => ({ ok: true, status: 200, text: async () => '{}' })) as never });
    expect(p?.id).toBe('nvidia');
    expect(p?.capabilities()).toMatchObject({ chat: true, embed: true });
  });

  it('sends the key as a bearer token to the nvidia endpoint', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const fetch = (async (url: string, init: { headers: Record<string, string> }) => {
      seen.push({ url, headers: init.headers });
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'hi' } }] }) };
    }) as never;
    const p = createProvider({ mode: 'key', provider: 'nvidia', summaries: true }, { apiKey: 'nvapi-x' }, { fetch })!;
    await p.complete({ system: 's', user: 'u' });
    expect(seen[0]!.url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(seen[0]!.headers.authorization).toBe('Bearer nvapi-x');
  });
});
