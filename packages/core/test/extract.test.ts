import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Platform } from '../src/platform';
import { MAX_HTML_BYTES, enrichers, guessTypeFromUrl, runEnrichers } from '../src/extract';

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures/extract', n), 'utf8');

// Only fetchText matters here; enrichers never touch the rest of Platform.
function fakePlatform(routes: Record<string, { html: string; contentType?: string }>) {
  const calls: { url: string; maxBytes?: number }[] = [];
  const platform = {
    fetchText: async (url: string, opts?: { maxBytes?: number }) => {
      calls.push({ url, maxBytes: opts?.maxBytes });
      const key = Object.keys(routes).find((k) => url.startsWith(k));
      if (!key) throw new Error('404 ' + url);
      return { html: routes[key]!.html, finalUrl: url, contentType: routes[key]!.contentType ?? 'text/html' };
    },
  } as unknown as Platform;
  return { platform, calls };
}
const meta = (r: { meta?: string | null }) => JSON.parse(r.meta ?? '{}');

describe('openGraph + readability', () => {
  it('extracts og fields, favicon, canonical, thumb and body', async () => {
    const { platform, calls } = fakePlatform({ 'https://example.com/articles/1': { html: fx('article.html') } });
    const r = await runEnrichers('https://example.com/articles/1', { platform });
    expect(calls[0]).toEqual({ url: 'https://example.com/articles/1', maxBytes: MAX_HTML_BYTES });
    expect(r.type).toBe('article');
    expect(r.title).toBe('OG Article Title');
    expect(r.summary).toBe('An og description');
    expect(meta(r)).toMatchObject({ favicon: 'https://example.com/fav.png', canonical: 'https://example.com/articles/1', site_name: 'Example Mag' });
    expect(r.files).toContainEqual({ role: 'thumb', url: 'https://example.com/img/hero.jpg' });
    expect(r.body).toContain('Paragraph one of the article body');
    expect(r.body).not.toContain('Home About Contact');
    const reader = r.files!.find((f) => f.role === 'reader_html')!;
    expect(new TextDecoder().decode(reader.bytes)).toContain('<p>');
  });

  it('skips readability under 200 chars and uses provided html without fetching', async () => {
    const { platform, calls } = fakePlatform({});
    const r = await runEnrichers('https://example.com/x', { platform, html: '<html><head><title>T</title></head><body><p>tiny</p></body></html>' });
    expect(calls).toEqual([]);
    expect(r.title).toBe('T');
    expect(r.body).toBeUndefined();
  });

  it('truncates html at 2 MB', async () => {
    const html = '<html><head><title>Big</title></head><body>' + 'x'.repeat(MAX_HTML_BYTES) + '<meta property="og:title" content="AFTER">';
    const r = await runEnrichers('https://example.com/big', { platform: fakePlatform({}).platform, html });
    expect(r.title).toBe('Big');
  });
});

describe('oembed', () => {
  const oe = JSON.stringify({ type: 'video', title: 'OE Title', author_name: 'Auth', html: '<iframe></iframe>', thumbnail_url: 'https://t/1.jpg' });
  it('uses static provider for youtube and site enricher wins on merge', async () => {
    const { platform, calls } = fakePlatform({ 'https://www.youtube.com/oembed': { html: oe }, 'https://www.youtube.com/watch': { html: '<html><head><title>YT</title></head></html>' } });
    const r = await runEnrichers('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { platform });
    expect(calls.map((c) => c.url)).toContain('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
    expect(r.type).toBe('video');
    expect(r.title).toBe('OE Title');
    expect(meta(r)).toMatchObject({ author: 'Auth', embed_html: '<iframe></iframe>', video_id: 'dQw4w9WgXcQ' });
    expect(r.files).toContainEqual({ role: 'thumb', url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' });
    expect(r.files).toContainEqual({ role: 'thumb', url: 'https://t/1.jpg' });
  });
  it('uses discovery link', async () => {
    const { platform, calls } = fakePlatform({ 'https://example.com/oembed': { html: oe } });
    const r = await runEnrichers('https://example.com/v', { platform, html: fx('oembed-discovery.html') });
    expect(calls[0]!.url).toBe('https://example.com/oembed?url=x');
    expect(r.title).toBe('OE Title');
  });
});

describe('site enrichers', () => {
  const p = fakePlatform({}).platform;
  it('github', async () => {
    const r = await runEnrichers('https://github.com/foo/bar', { platform: p });
    expect(r.type).toBe('repo'); expect(meta(r)).toEqual({ owner: 'foo', repo: 'bar' });
  });
  it('twitter/x', async () => {
    expect((await runEnrichers('https://x.com/jack/status/20', { platform: p })).type).toBe('tweet');
    expect(meta(await runEnrichers('https://twitter.com/jack/status/20', { platform: p }))).toEqual({ handle: 'jack', tweet_id: '20' });
  });
  it('reddit', async () => {
    expect(meta(await runEnrichers('https://www.reddit.com/r/typescript/comments/1', { platform: p }))).toEqual({ subreddit: 'typescript' });
  });
  it('amazon book', async () => {
    const r = await runEnrichers('https://www.amazon.com/Some-Book/dp/0132350882/ref=x', { platform: p });
    expect(r.type).toBe('book'); expect(meta(r)).toEqual({ asin: '0132350882' });
  });
  it('recipe json-ld overrides og', async () => {
    const r = await runEnrichers('https://food.example/p', { platform: p, html: fx('recipe.html') });
    expect(r.type).toBe('recipe'); expect(r.title).toBe('Fluffy Pancakes');
    expect(meta(r)).toEqual({ ingredients: ['2 cups flour', '1 egg'], instructions: ['Mix.', 'Fry.'], favicon: 'https://food.example/favicon.ico' });
  });
  it('pdf by extension and content-type', async () => {
    const r = await runEnrichers('https://a.com/x.pdf', { platform: p });
    expect(r.type).toBe('pdf'); expect(r.files).toEqual([{ role: 'original', url: 'https://a.com/x.pdf', mime: 'application/pdf' }]);
    const ct = fakePlatform({ 'https://a.com/doc': { html: '%PDF', contentType: 'application/pdf' } }).platform;
    expect((await runEnrichers('https://a.com/doc', { platform: ct })).type).toBe('pdf');
  });
  it('image', async () => {
    expect((await runEnrichers('https://a.com/x.png', { platform: p })).type).toBe('image');
    const ct = fakePlatform({ 'https://a.com/i': { html: '', contentType: 'image/jpeg' } }).platform;
    expect((await runEnrichers('https://a.com/i', { platform: ct })).type).toBe('image');
  });
  it('registry order and guessTypeFromUrl', () => {
    expect(enrichers.map((e) => e.id)).toEqual(['youtube', 'github', 'twitter', 'reddit', 'instagram', 'amazonBook', 'recipe', 'pdf', 'image', 'oembed', 'openGraph', 'readability']);
    expect(guessTypeFromUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('video');
    expect(guessTypeFromUrl('https://github.com/a/b')).toBe('repo');
    expect(guessTypeFromUrl('https://x.com/a/status/1')).toBe('tweet');
    expect(guessTypeFromUrl('https://amazon.co.uk/dp/B000000000')).toBe('book');
    expect(guessTypeFromUrl('https://a.com/f.pdf')).toBe('pdf');
    expect(guessTypeFromUrl('https://a.com/f.webp')).toBe('image');
    expect(guessTypeFromUrl('https://a.com/')).toBe('link');
    expect(guessTypeFromUrl('not a url')).toBe('note');
  });
});

describe('readability types long prose as article', () => {
  it('og:type=website with a real body becomes article', async () => {
    const html = '<html><head><title>W</title><meta property="og:type" content="website"></head><body><article>' + '<p>' + 'Readable sentence here. '.repeat(40) + '</p>'.repeat(1) + '</article></body></html>';
    const r = await runEnrichers('https://en.wikipedia.org/wiki/Memex', { platform: fakePlatform({}).platform, html });
    expect(r.type).toBe('article');
    expect(r.body).toContain('Readable sentence');
  });
});
