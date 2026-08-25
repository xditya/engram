// Titles derived from the url alone, for pages that gave none (JS shells, login walls, blocked hosts).

const humanise = (seg: string) => {
  let s = seg;
  try { s = decodeURIComponent(s); } catch { /* keep raw */ }
  // Drop trailing id tokens ("cat-3o7TKSjRrfIPjeiVyM", "post-12345"): letters+digits mixed, or all digits.
  s = s.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_+]+/g, ' ').replace(/(\s+(?:(?=\w*\d)(?=\w*[a-z])\w{6,}|\d+))+$/i, '').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
// A slug with word separators, or one long word; ids (digits, hashes, short codes) are not titles.
const meaningful = (seg: string) => /[a-z]/i.test(seg) && !/^[0-9a-f]{8,}$/i.test(seg) && (/[-_+%]/.test(seg) || /^[a-z]{8,}$/i.test(seg));

export function titleFromUrl(url: string): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  const host = u.hostname.replace(/^www\./, '');
  const segs = u.pathname.split('/').filter(Boolean);
  const site = (h: string) => host === h || host.endsWith('.' + h);
  if (site('instagram.com')) return segs[0] && !/^(p|reel|reels|tv|explore|stories)$/.test(segs[0]) ? `@${segs[0]} on Instagram` : 'Instagram post';
  if (site('twitter.com') || site('x.com')) return segs[0] ? `@${segs[0]} on X` : host;
  if (site('tiktok.com') && segs[0]?.startsWith('@')) return `${segs[0]} on TikTok`;
  if ((site('threads.com') || site('threads.net')) && segs[0]?.startsWith('@')) return `${segs[0]} on Threads`;
  if (site('reddit.com') && segs[0] === 'r' && segs[1]) return segs[2] === 'comments' && segs[4] ? `r/${segs[1]}: ${humanise(segs[4])}` : `r/${segs[1]}`;
  if (site('youtube.com') || site('youtu.be')) return 'YouTube video';
  if (site('github.com') && segs[1]) return `${segs[0]}/${segs[1]}`;
  const last = [...segs].reverse().find(meaningful);
  return last ? humanise(last) : host;
}

// "domain/path" for a card subtitle: no scheme, no query, ellipsised past max.
export function shortUrl(url: string, max = 40): string {
  let s = url;
  try { const u = new URL(url); s = u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, ''); } catch { /* not a url: show as is */ }
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
