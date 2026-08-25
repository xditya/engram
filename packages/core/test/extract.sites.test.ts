import { describe, expect, it } from 'vitest';
import type { Platform } from '../src/platform';
import { runEnrichers, shortUrl, titleFromUrl } from '../src/extract';

function fakePlatform(routes: Record<string, string>) {
  const calls: string[] = [];
  const platform = {
    fetchText: async (url: string) => {
      calls.push(url);
      const key = Object.keys(routes).find((k) => url.startsWith(k));
      if (!key) throw new Error('404 ' + url);
      return { html: routes[key]!, finalUrl: url, contentType: routes[key]!.startsWith('{') ? 'application/json' : 'text/html' };
    },
  } as unknown as Platform;
  return { platform, calls };
}
const meta = (r: { meta?: string | null }) => JSON.parse(r.meta ?? '{}');

// Shapes copied from real responses on 2026-08-25.
const IG_POST = `<html><head><title>Instagram</title>
<meta property="og:title" content="NASA on Instagram: &quot;With your powers combined&#x2026; This colorful picture&quot;" />
<meta property="og:description" content="405K likes, 2,782 comments - nasa on August 19, 2026: &quot;With your powers combined&#x2026;&quot;" />
<meta property="og:image" content="https://scontent.cdninstagram.com/v/t51.82787-15/780550892_n.jpg?x=1&amp;y=2" />
<meta property="og:url" content="https://www.instagram.com/nasa/p/DcOX3hWFiey/" />
<meta property="og:type" content="article" /></head><body></body></html>`;
const IG_LOGIN = '<html><head><title>Instagram</title></head><body><a href="/accounts/login/">Log in</a></body></html>';
const IG_EMBED = '<html><body><a class="Avatar"></a><span class="UsernameText">nasa</span><img class="EmbeddedMediaImage" alt="" src="https://instagram.fna.fbcdn.net/v/t51/1.jpg?a=1&amp;b=2" /></body></html>';

describe('instagram', () => {
  it('post page og tags: image type, handle, caption title, thumb', async () => {
    const { platform, calls } = fakePlatform({ 'https://www.instagram.com/p/DcOX3hWFiey/': IG_POST });
    const r = await runEnrichers('https://www.instagram.com/p/DcOX3hWFiey/?igsh=abc', { platform });
    expect(calls).toEqual(['https://www.instagram.com/p/DcOX3hWFiey/?igsh=abc']); // no embed fetch needed
    expect(r.type).toBe('link');
    expect(r.title).toBe('@nasa on Instagram: With your powers combined… This colorful picture');
    expect(r.summary).toBe('With your powers combined… This colorful picture');
    expect(meta(r)).toMatchObject({ shortcode: 'DcOX3hWFiey', handle: 'nasa' });
    expect(r.files).toContainEqual({ role: 'thumb', url: 'https://scontent.cdninstagram.com/v/t51.82787-15/780550892_n.jpg?x=1&y=2' });
  });
  it('reel is video; login wall falls back to the embed page and never keeps the "Instagram" title', async () => {
    const { platform } = fakePlatform({ 'https://www.instagram.com/reel/DcMXl1IPNtB/': IG_LOGIN, 'https://www.instagram.com/p/DcMXl1IPNtB/embed/captioned/': IG_EMBED });
    const r = await runEnrichers('https://www.instagram.com/reel/DcMXl1IPNtB/', { platform });
    expect(r.type).toBe('video');
    expect(r.title).toBe('@nasa on Instagram');
    expect(r.files).toEqual([{ role: 'thumb', url: 'https://instagram.fna.fbcdn.net/v/t51/1.jpg?a=1&b=2' }]);
  });
  it('nothing reachable: still a url-derived title', async () => {
    const r = await runEnrichers('https://www.instagram.com/p/DcOX3hWFiey/', { platform: fakePlatform({}).platform });
    expect(r.title).toBe('Instagram post');
    expect(meta(r)).toEqual({ shortcode: 'DcOX3hWFiey' });
  });
});

describe('oembed providers', () => {
  it('reddit / tiktok / dailymotion / flickr hit their static endpoints', async () => {
    for (const [page, endpoint] of [
      ['https://www.reddit.com/r/space/comments/abc/x/', 'https://www.reddit.com/oembed'],
      ['https://www.tiktok.com/@nasa/video/1', 'https://www.tiktok.com/oembed'],
      ['https://www.dailymotion.com/video/x7tgad0', 'https://www.dailymotion.com/services/oembed'],
      ['https://www.flickr.com/photos/nasa/1/', 'https://www.flickr.com/services/oembed/'],
    ]) {
      const { platform, calls } = fakePlatform({ [endpoint!]: JSON.stringify({ title: 'OE', author_name: 'A', thumbnail_url: 'https://t/1.jpg' }) });
      const r = await runEnrichers(page!, { platform });
      expect(calls).toContain(`${endpoint}?format=json&url=${encodeURIComponent(page!)}`);
      expect(r.title).toBe('OE');
      expect(r.files).toContainEqual({ role: 'thumb', url: 'https://t/1.jpg' });
    }
  });
});

describe('openGraph image fallbacks', () => {
  const p = fakePlatform({}).platform;
  const run = (head: string) => runEnrichers('https://ex.com/a/b', { platform: p, html: `<html><head><title>X</title>${head}</head><body></body></html>` });
  it('twitter:image:src', async () => {
    expect((await run('<meta name="twitter:image:src" content="/i.png">')).files).toEqual([{ role: 'thumb', url: 'https://ex.com/i.png' }]);
  });
  it('link rel=image_src', async () => {
    expect((await run('<link rel="image_src" href="img/i.png">')).files).toEqual([{ role: 'thumb', url: 'https://ex.com/a/img/i.png' }]);
  });
  it('json-ld image (string, object, array)', async () => {
    expect((await run('<script type="application/ld+json">{"@type":"Article","image":{"@type":"ImageObject","url":"https://m/1.gif"}}</script>')).files).toEqual([{ role: 'thumb', url: 'https://m/1.gif' }]);
    expect((await run('<script type="application/ld+json">{"image":["https://m/2.gif"]}</script>')).files).toEqual([{ role: 'thumb', url: 'https://m/2.gif' }]);
  });
  it('bare shell titles are replaced by a url-derived one', async () => {
    expect((await runEnrichers('https://www.pinterest.com/pin/123/', { platform: p, html: '<html><head><title>Pinterest</title></head></html>' })).title).toBe('pinterest.com');
    expect((await runEnrichers('https://open.spotify.com/track/4cO', { platform: p, html: '<html><head><title>Spotify – Web Player</title></head></html>' })).title).toBe('open.spotify.com');
    expect((await runEnrichers('https://ex.com/', { platform: p, html: '<html><head><title>Real Title</title></head></html>' })).title).toBe('Real Title');
  });
});

describe('titleFromUrl ids', () => {
  it('drops trailing id tokens', () => {
    expect(titleFromUrl('https://giphy.com/gifs/cat-3o7TKSjRrfIPjeiVyM')).toBe('Cat');
    expect(titleFromUrl('https://example.com/blog/my-great-post-12345')).toBe('My great post');
  });
});

describe('titleFromUrl', () => {
  it.each([
    ['https://www.instagram.com/nasa/', '@nasa on Instagram'],
    ['https://www.instagram.com/reel/DcMXl1IPNtB/', 'Instagram post'],
    ['https://x.com/jack/status/20', '@jack on X'],
    ['https://www.tiktok.com/@nasa/video/7000', '@nasa on TikTok'],
    ['https://www.threads.com/@zuck/post/Db2wI-DilLt', '@zuck on Threads'],
    ['https://www.reddit.com/r/Gundam/comments/1f0h1s2/question_about_alltheanime_4k_set/', 'r/Gundam: Question about alltheanime 4k set'],
    ['https://www.reddit.com/r/typescript/', 'r/typescript'],
    ['https://github.com/foo/bar', 'foo/bar'],
    ['https://youtu.be/dQw4w9WgXcQ', 'YouTube video'],
    ['https://blog.example.com/2024/my-post-title.html?utm=1', 'My post title'],
    ['https://ex.com/posts/1234567', 'ex.com'],
    ['https://ex.com/a/b3f9c1d2e4/', 'ex.com'],
    ['https://www.example.com/', 'example.com'],
    ['https://en.wikipedia.org/wiki/Vannevar_Bush', 'Vannevar Bush'],
    ['https://ex.com/some%20page', 'Some page'],
    ['not a url', 'not a url'],
  ])('%s -> %s', (url, want) => expect(titleFromUrl(url)).toBe(want));
});

describe('shortUrl', () => {
  it('strips scheme, www, query, trailing slash and ellipsises', () => {
    expect(shortUrl('https://www.example.com/a/b/?q=1')).toBe('example.com/a/b');
    expect(shortUrl('https://www.instagram.com/p/DcOX3hWFiey/')).toBe('instagram.com/p/DcOX3hWFiey');
    expect(shortUrl('https://example.com/' + 'x'.repeat(60))).toHaveLength(40);
    expect(shortUrl('https://example.com/' + 'x'.repeat(60)).endsWith('…')).toBe(true);
  });
});
