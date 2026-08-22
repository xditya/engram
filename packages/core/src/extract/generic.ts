import { Readability } from '@mozilla/readability';
import type { Enricher, PendingFile } from './types';
import type { Item, ItemType } from '../model/types';
import { absoluteUrl, cleanText, meta, parseHtml } from './html';

type Out = Partial<Item> & { files?: PendingFile[] };

const OG_TYPE: Record<string, ItemType> = { article: 'article', book: 'book', product: 'product', video: 'video' };

export const openGraph: Enricher = {
  id: 'openGraph',
  match: () => 1,
  async enrich({ url, html }) {
    if (!html) return {};
    const doc = parseHtml(html);
    const out: Out = {};
    out.title = cleanText(meta(doc, ['og:title', 'twitter:title']) ?? doc.querySelector('title')?.textContent);
    out.summary = cleanText(meta(doc, ['og:description', 'twitter:description', 'description']));
    const ogType = meta(doc, ['og:type'])?.toLowerCase().split('.')[0];
    if (ogType && OG_TYPE[ogType]) out.type = OG_TYPE[ogType];
    const m: Record<string, string> = {};
    const canonical = absoluteUrl(meta(doc, ['og:url']) ?? doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), url);
    if (canonical) m.canonical = canonical;
    const site = meta(doc, ['og:site_name']);
    if (site) m.site_name = site;
    const icon = absoluteUrl(doc.querySelector('link[rel~="icon"]')?.getAttribute('href') ?? '/favicon.ico', url);
    if (icon) m.favicon = icon;
    if (Object.keys(m).length) out.meta = JSON.stringify(m);
    const img = absoluteUrl(meta(doc, ['og:image', 'og:image:url', 'twitter:image']), url);
    if (img) out.files = [{ role: 'thumb', url: img }];
    return out;
  },
};

export const readability: Enricher = {
  id: 'readability',
  match: () => 1,
  async enrich({ html }) {
    if (!html) return {};
    let art: ReturnType<Readability['parse']> = null;
    try { art = new Readability(parseHtml(html) as unknown as Document).parse(); } catch { return {}; }
    const text = cleanText(art?.textContent);
    if (!art || !text || text.length < 200) return {};
    const out: Out = { body: text };
    if (art.title) out.title = cleanText(art.title);
    if (art.content) out.files = [{ role: 'reader_html', bytes: new TextEncoder().encode(art.content), mime: 'text/html' }];
    return out;
  },
};
