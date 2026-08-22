export function parseDate(v: string | undefined): number | undefined {
  if (!v) return undefined;
  if (/^\d{9,10}$/.test(v)) return Number(v) * 1000;
  if (/^\d{12,13}$/.test(v)) return Number(v);
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

export function splitTags(v: string | undefined, sep: RegExp = /[,;|]/): string[] {
  return (v ?? '').split(sep).map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
