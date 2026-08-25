import type { Enricher } from './types';
import { cleanText, jsonLd, meta, parseHtml } from './html';

const host = (u: URL) => u.hostname.replace(/^www\./, '');
const is = (u: URL, ...hosts: string[]) => hosts.some((h) => host(u) === h || host(u).endsWith('.' + h));

export function youtubeId(u: URL): string | null {
  if (is(u, 'youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
  if (!is(u, 'youtube.com')) return null;
  const m = /^\/(?:shorts|embed|live)\/([\w-]{11})/.exec(u.pathname);
  return m?.[1] ?? u.searchParams.get('v');
}

export const youtube: Enricher = {
  id: 'youtube',
  match: (u) => (youtubeId(u) ? 10 : 0),
  async enrich({ url }) {
    const id = youtubeId(url)!;
    return { type: 'video', meta: JSON.stringify({ video_id: id }), files: [{ role: 'thumb', url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }] };
  },
};

const repoPath = (u: URL) => /^\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(u.pathname);
export const github: Enricher = {
  id: 'github',
  match: (u) => (is(u, 'github.com') && repoPath(u) ? 10 : 0),
  async enrich({ url }) {
    const [, owner, repo] = repoPath(url)!;
    return { type: 'repo', meta: JSON.stringify({ owner, repo }) };
  },
};

export const twitter: Enricher = {
  id: 'twitter',
  match: (u) => (is(u, 'twitter.com', 'x.com') && /\/status\/\d+/.test(u.pathname) ? 10 : 0),
  async enrich({ url }) {
    const m = /^\/([^/]+)\/status\/(\d+)/.exec(url.pathname)!;
    return { type: 'tweet', meta: JSON.stringify({ handle: m[1], tweet_id: m[2] }) };
  },
};

export const reddit: Enricher = {
  id: 'reddit',
  match: (u) => (is(u, 'reddit.com') && u.pathname.startsWith('/r/') ? 10 : 0),
  async enrich({ url }) {
    return { meta: JSON.stringify({ subreddit: url.pathname.split('/')[2] }) };
  },
};

// Verified 2026-08-25: public posts/reels serve og:title (`Name on Instagram: "caption"`), og:description
// ("405K likes, 2 comments - handle on Aug 19, 2026: ..."), og:image and og:url (/handle/p/<code>/) to any UA.
// A missing/private post has no og:title and <title>Instagram</title>, so that title is never used.
// The /embed/captioned/ page still carries the image and handle when the post page does not.
const igCode = (u: URL) => /^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([\w-]+)/.exec(u.pathname);
export const instagram: Enricher = {
  id: 'instagram',
  match: (u) => (is(u, 'instagram.com') && igCode(u) ? 10 : 0),
  async enrich({ url, html, platform }) {
    const [, kind, shortcode] = igCode(url)!;
    const doc = html ? parseHtml(html) : null;
    const og = (n: string) => (doc ? meta(doc, [n]) : null) ?? '';
    let handle = /^\/([^/]+)\/(?:p|reel|reels|tv)\//.exec(new URL(og('og:url') || '/', url).pathname)?.[1]
      ?? /\s-\s(\S+)\son\s/.exec(og('og:description'))?.[1];
    // og:title is `Name on Instagram: "caption"`; keep the caption only.
    const caption = cleanText(/:\s*"([\s\S]*?)"?\s*$/.exec(og('og:title'))?.[1]);
    let img: string | null = og('og:image') || null;
    if (!img || !handle) {
      try {
        const embed = (await platform.fetchText(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, { maxBytes: 512 * 1024 })).html;
        img ??= /class="EmbeddedMediaImage"[^>]*\ssrc="([^"]+)"/.exec(embed)?.[1]?.replace(/&amp;/g, '&') ?? null;
        handle ??= /class="UsernameText">([^<]+)</.exec(embed)?.[1];
      } catch { /* login wall or offline: the card keeps what the post page gave */ }
    }
    const title = (handle ? `@${handle} on Instagram` : 'Instagram post') + (caption ? `: ${caption.slice(0, 80)}` : '');
    return {
      // A post renders as a link card (thumb + caption + handle); a reel is a video only once a poster exists.
      type: kind !== 'p' && img ? 'video' : 'link',
      title,
      ...(caption ? { summary: caption } : {}),
      meta: JSON.stringify({ shortcode, ...(handle ? { handle } : {}) }),
      ...(img ? { files: [{ role: 'thumb', url: img }] } : {}),
    };
  },
};

const asin = (u: URL) => /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i.exec(u.pathname)?.[1] ?? null;
export const amazonBook: Enricher = {
  id: 'amazonBook',
  // ponytail: every amazon /dp/ is typed book; check og:type or the breadcrumb for non-book products when it bites.
  match: (u) => (/(^|\.)amazon\./.test(host(u)) && asin(u) ? 10 : 0),
  async enrich({ url }) {
    return { type: 'book', meta: JSON.stringify({ asin: asin(url)!.toUpperCase() }) };
  },
};

// schema.org values come as strings, {text}, or HowToSection {itemListElement}; flatten to trimmed strings.
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v : v == null ? [] : [v]).flatMap((x): string[] => {
  if (typeof x === 'string') return [x.replace(/\s+/g, ' ').trim()];
  const o = x as { text?: string; itemListElement?: unknown };
  if (o?.itemListElement) return listOf(o.itemListElement);
  return typeof o?.text === 'string' ? [o.text.replace(/\s+/g, ' ').trim()] : [];
}).filter(Boolean);

export const recipe: Enricher = {
  id: 'recipe',
  match: () => 2,
  async enrich({ html }) {
    if (!html) return {};
    const r = jsonLd(parseHtml(html)).find((n) => {
      const t = (n as { '@type'?: unknown })?.['@type'];
      return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
    }) as Record<string, unknown> | undefined;
    if (!r) return {};
    return {
      type: 'recipe',
      ...(typeof r.name === 'string' ? { title: r.name } : {}),
      meta: JSON.stringify({ ingredients: listOf(r.recipeIngredient), instructions: listOf(r.recipeInstructions) }),
    };
  },
};

export const pdf: Enricher = {
  id: 'pdf',
  match: (u, ct) => (ct?.includes('application/pdf') || /\.pdf$/i.test(u.pathname) ? 10 : 0),
  async enrich({ url }) {
    return { type: 'pdf', files: [{ role: 'original', url: url.href, mime: 'application/pdf' }] };
  },
};

export const image: Enricher = {
  id: 'image',
  match: (u, ct) => (ct?.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(u.pathname) ? 10 : 0),
  async enrich({ url }) {
    return { type: 'image', files: [{ role: 'original', url: url.href }] };
  },
};
