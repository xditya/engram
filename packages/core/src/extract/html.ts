import { DOMParser } from 'linkedom';

export const MAX_HTML_BYTES = 2 * 1024 * 1024;

// linkedom's Document type is its own; callers only need the DOM subset below.
export type Doc = ReturnType<DOMParser['parseFromString']>;

export function capHtml(html: string): string {
  // ponytail: JS string length (UTF-16 units) stands in for bytes; exact byte cap if it ever matters.
  return html.length > MAX_HTML_BYTES ? html.slice(0, MAX_HTML_BYTES) : html;
}

export function parseHtml(html: string): Doc {
  return new DOMParser().parseFromString(capHtml(html), 'text/html');
}

// First non-empty content of <meta property|name=...> in the given order.
export function meta(doc: Doc, names: string[]): string | null {
  for (const n of names) {
    const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`);
    const v = el?.getAttribute('content')?.trim();
    if (v) return v;
  }
  return null;
}

export function absoluteUrl(href: string | null | undefined, base: URL): string | null {
  if (!href) return null;
  try { return new URL(href.trim(), base).href; } catch { return null; }
}

export function cleanText(s: string | null | undefined): string | null {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t || null;
}

export function jsonLd(doc: Doc): unknown[] {
  const out: unknown[] = [];
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const v = JSON.parse(s.textContent ?? '');
      const nodes = Array.isArray(v) ? v : (v?.['@graph'] ?? [v]);
      out.push(...(Array.isArray(nodes) ? nodes : [nodes]));
    } catch { /* malformed block: ignore */ }
  }
  return out;
}
