// Where a saved link can play inside the app: the site's own embed page in a web view (terms-safe, keeps
// working when the site changes its internals), or a media file straight into a native player.

export type Playable = { kind: 'embed' | 'file'; src: string; ratio: number };

const YT_ID = /^[\w-]{11}$/;

export function playable(url: string | null | undefined): Playable | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const segs = u.pathname.split('/').filter(Boolean);
  const site = (h: string) => host === h || host.endsWith('.' + h);

  if (/\.(mp4|m4v|webm|mov|m3u8)$/i.test(u.pathname)) return { kind: 'file', src: url, ratio: 16 / 9 };

  if (site('youtu.be') || site('youtube.com') || site('youtube-nocookie.com')) {
    const id = site('youtu.be') ? segs[0] : u.searchParams.get('v') ?? (['shorts', 'embed', 'live', 'v'].includes(segs[0] ?? '') ? segs[1] : undefined);
    if (!id || !YT_ID.test(id)) return null;
    const t = u.searchParams.get('t')?.replace(/s$/, '');
    return { kind: 'embed', src: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&autoplay=1&rel=0${t && /^\d+$/.test(t) ? `&start=${t}` : ''}`, ratio: segs[0] === 'shorts' ? 9 / 16 : 16 / 9 };
  }
  if (site('instagram.com')) {
    const i = segs.findIndex((s) => ['p', 'reel', 'reels', 'tv'].includes(s));
    const code = i >= 0 ? segs[i + 1] : undefined;
    if (!code || !/^[\w-]{5,}$/.test(code)) return null;
    return { kind: 'embed', src: `https://www.instagram.com/${segs[i] === 'p' ? 'p' : 'reel'}/${code}/embed/`, ratio: segs[i] === 'p' ? 1 : 9 / 16 };
  }
  if (site('tiktok.com')) {
    const id = segs[segs.indexOf('video') + 1];
    return id && /^\d+$/.test(id) && segs.includes('video') ? { kind: 'embed', src: `https://www.tiktok.com/player/v1/${id}?autoplay=1`, ratio: 9 / 16 } : null;
  }
  if (site('vimeo.com')) {
    const id = segs.find((s) => /^\d{6,}$/.test(s));
    return id ? { kind: 'embed', src: `https://player.vimeo.com/video/${id}?autoplay=1&playsinline=1`, ratio: 16 / 9 } : null;
  }
  if (site('twitter.com') || site('x.com')) {
    const id = segs[segs.indexOf('status') + 1];
    return id && /^\d+$/.test(id) && segs.includes('status') ? { kind: 'embed', src: `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`, ratio: 1 } : null;
  }
  return null;
}
