import type { Enricher, PendingFile } from './types';
import type { Item, ItemType } from '../model/types';
import type { Platform } from '../platform';
import { MAX_HTML_BYTES, capHtml } from './html';
import { oembed } from './oembed';
import { openGraph, readability } from './generic';
import { amazonBook, github, image, pdf, recipe, reddit, twitter, youtube } from './sites';

export type Enriched = Partial<Item> & { files?: PendingFile[] };

const GENERIC: Enricher[] = [oembed, openGraph, readability];
const SITES: Enricher[] = [youtube, github, twitter, reddit, amazonBook, recipe, pdf, image];
export const enrichers: Enricher[] = [...SITES, ...GENERIC];

const parseMeta = (s: unknown): Record<string, unknown> => { try { return typeof s === 'string' ? JSON.parse(s) : {}; } catch { return {}; } };

// Later wins on scalars; meta JSON objects are unioned, files arrays concatenated.
function merge(base: Enriched, over: Enriched): Enriched {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v == null) continue;
    if (k === 'meta') out.meta = JSON.stringify({ ...parseMeta(base.meta), ...parseMeta(v) });
    else if (k === 'files') out.files = [...(base.files ?? []), ...(v as PendingFile[])];
    else out[k] = v;
  }
  return out as Enriched;
}

export async function runEnrichers(url: string, opts: { html?: string; platform: Platform }): Promise<Enriched> {
  const u = new URL(url);
  let html = opts.html;
  let contentType: string | undefined;
  if (html == null) {
    try {
      const r = await opts.platform.fetchText(url, { maxBytes: MAX_HTML_BYTES });
      html = r.html; contentType = r.contentType;
    } catch (e) {
      // An HTTP status means the host answered (a pdf/image url still enriches by extension); anything else is
      // offline, and the job must retry with backoff instead of finishing with a bare-domain card.
      if (!/^\d{3}\s/.test((e as Error).message ?? '')) throw new Error(`page fetch failed: ${(e as Error).message}`);
    }
  }
  if (html != null) html = capHtml(html);
  const site = SITES.map((e) => [e, e.match(u, contentType)] as const).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
  let out: Enriched = {};
  // Precedence: site > oembed > openGraph > readability. Merge is later-wins, so run in reverse.
  for (const e of site ? [...GENERIC].reverse().concat(site) : [...GENERIC].reverse()) {
    try { out = merge(out, await e.enrich({ url: u, html, platform: opts.platform })); } catch { /* one failing enricher never sinks the item */ }
  }
  return out;
}

// No network, no html: the label the share sheet shows before the extract job runs.
export function guessTypeFromUrl(url: string): ItemType {
  let u: URL;
  try { u = new URL(url); } catch { return 'note'; }
  const guess: Record<string, ItemType> = { youtube: 'video', github: 'repo', twitter: 'tweet', amazonBook: 'book', pdf: 'pdf', image: 'image' };
  for (const e of SITES) if (guess[e.id] && e.match(u) > 0) return guess[e.id]!;
  return 'link';
}
