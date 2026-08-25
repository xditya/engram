import type { Enricher, PendingFile } from './types';
import type { Item } from '../model/types';
import { parseHtml } from './html';

// host -> endpoint. A discovery <link type="application/json+oembed"> in the page wins when present.
// Verified unauthenticated from Node, 2026-08-25:
//   host             route                                   gives
//   vimeo.com        vimeo.com/api/oembed.json               title, author, thumb, type=video
//   soundcloud.com   soundcloud.com/oembed                   title, author, thumb
//   spotify.com      open.spotify.com/oembed                 title, thumb (the page itself is a JS shell)
//   reddit.com       reddit.com/oembed                       title, author; no thumb (page is a JS shell / 403)
//   dailymotion.com  dailymotion.com/services/oembed         title, author, thumb, type=video
//   flickr.com       flickr.com/services/oembed/             endpoint live (only a placeholder id was tried)
//   tiktok.com       tiktok.com/oembed                       NOT verifiable here (host blocked on the test network)
//   youtube / twitter: unchanged.
const PROVIDERS: [string, string][] = [
  ['youtube.com', 'https://www.youtube.com/oembed'],
  ['youtu.be', 'https://www.youtube.com/oembed'],
  ['vimeo.com', 'https://vimeo.com/api/oembed.json'],
  ['twitter.com', 'https://publish.twitter.com/oembed'],
  ['x.com', 'https://publish.twitter.com/oembed'],
  ['soundcloud.com', 'https://soundcloud.com/oembed'],
  ['spotify.com', 'https://open.spotify.com/oembed'],
  ['reddit.com', 'https://www.reddit.com/oembed'],
  ['tiktok.com', 'https://www.tiktok.com/oembed'],
  ['dailymotion.com', 'https://www.dailymotion.com/services/oembed'],
  ['flickr.com', 'https://www.flickr.com/services/oembed/'],
];

export function oembedEndpoint(url: URL, html?: string): string | null {
  if (html) {
    const href = parseHtml(html).querySelector('link[type="application/json+oembed"]')?.getAttribute('href');
    if (href) try { return new URL(href, url).href; } catch { /* fall through to static list */ }
  }
  const host = url.hostname.replace(/^www\./, '');
  const p = PROVIDERS.find(([h]) => host === h || host.endsWith('.' + h));
  return p ? `${p[1]}?format=json&url=${encodeURIComponent(url.href)}` : null;
}

export const oembed: Enricher = {
  id: 'oembed',
  match: () => 1,
  async enrich({ url, html, platform }) {
    const endpoint = oembedEndpoint(url, html);
    if (!endpoint) return {};
    let data: Record<string, unknown>;
    try { data = JSON.parse((await platform.fetchText(endpoint, { maxBytes: 64 * 1024 })).html); } catch { return {}; }
    const out: Partial<Item> & { files?: PendingFile[] } = {};
    if (typeof data.title === 'string') out.title = data.title;
    const m: Record<string, unknown> = {};
    if (typeof data.author_name === 'string') m.author = data.author_name;
    if (typeof data.html === 'string') m.embed_html = data.html;
    if (typeof data.provider_name === 'string') m.provider = data.provider_name;
    if (Object.keys(m).length) out.meta = JSON.stringify(m);
    if (typeof data.thumbnail_url === 'string') out.files = [{ role: 'thumb', url: data.thumbnail_url }];
    if (data.type === 'video') out.type = 'video';
    return out;
  },
};
