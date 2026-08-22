// The same page saved twice with tracking junk or a trailing slash collapses to one key.
export function normalizeUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return raw.trim(); }
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ref$)/i.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  let s = u.toString();
  if (u.search === '') s = s.replace(/\/$/, '');
  return s;
}

export function dedupKey(url?: string | null, contentHash?: string | null): string | null {
  if (url) return `url:${normalizeUrl(url)}`;
  if (contentHash) return `hash:${contentHash}`;
  return null;
}
