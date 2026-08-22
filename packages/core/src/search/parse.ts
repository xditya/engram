import type { Item } from '../model/types';

export interface Token {
  raw: string;
  neg: boolean;
  kind: 'word' | 'phrase' | 'op';
  op?: string;
  value: string;
}

export interface Parsed {
  ftsMatch: string | null;
  where: string[];
  params: unknown[];
  chips: Token[];
  post: ((item: Item) => boolean)[]; // filters SQL can't express (named colors)
  trash: boolean;
  plainWords: number;
}

export const OPERATORS = ['tag', 'type', 'site', 'text', 'color', 'before', 'after', 'on', 'is', 'has', 'in'] as const;

const TOKEN = /(-?)(?:#(\S+)|([a-z]+):(?:"([^"]*)"?|(\S*))|"([^"]*)"?|(\S+))/gi;

export function tokenize(q: string): Token[] {
  const out: Token[] = [];
  for (const m of q.matchAll(TOKEN)) {
    const [raw, dash, hash, op, qv, ov, phrase, word] = m;
    const neg = dash === '-';
    if (hash !== undefined) out.push({ raw, neg, kind: 'op', op: 'tag', value: hash });
    else if (op !== undefined && (OPERATORS as readonly string[]).includes(op.toLowerCase())) {
      const value = qv ?? ov ?? '';
      if (value) out.push({ raw, neg, kind: 'op', op: op.toLowerCase(), value });
    } else if (phrase !== undefined) { if (phrase.trim()) out.push({ raw, neg, kind: 'phrase', value: phrase.trim() }); }
    else if (op !== undefined) out.push({ raw, neg, kind: 'word', value: `${op}:${qv ?? ov ?? ''}` });
    else if (word !== undefined) out.push({ raw, neg, kind: 'word', value: word });
  }
  return out;
}

const ftsQuote = (s: string) => `"${s.replace(/"/g, '""')}"`;

// [start, end) in epoch ms, local time. Returns null for unparseable input.
export function parseDate(v: string, now: number): [number, number] | null {
  const d = new Date(now);
  const day = (y: number, m: number, dd: number): [number, number] =>
    [new Date(y, m, dd).getTime(), new Date(y, m, dd + 1).getTime()];
  const s = v.toLowerCase().trim();
  if (s === 'today') return day(d.getFullYear(), d.getMonth(), d.getDate());
  if (s === 'yesterday') return day(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  if (s === 'last week' || s === 'lastweek') return [new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7).getTime(), now];
  if (s === 'last month' || s === 'lastmonth') return [new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()).getTime(), now];
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return day(+m[1]!, +m[2]! - 1, +m[3]!);
  m = /^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(s);
  if (m) {
    const mo = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1]!.slice(0, 3));
    if (mo >= 0) return day(m[3] ? +m[3] : d.getFullYear(), mo, +m[2]!);
  }
  return null;
}

// ponytail: named colors = hue buckets on HSL, no perceptual distance; swap for CIE dE if users complain.
const HUES: Record<string, [number, number]> = {
  red: [345, 15], orange: [15, 45], yellow: [45, 70], green: [70, 170], teal: [170, 200], cyan: [170, 200],
  blue: [200, 260], purple: [260, 300], violet: [260, 300], pink: [300, 345], magenta: [300, 345],
};
export function colorMatches(name: string, hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return false;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = hueOf(r, g, b, max, d);
  if (name === 'black') return l < 0.15;
  if (name === 'white') return l > 0.9;
  if (name === 'gray' || name === 'grey') return sat < 0.12 && l >= 0.15 && l <= 0.9;
  if (name === 'brown') return sat >= 0.12 && l < 0.45 && h >= 15 && h < 45;
  const range = HUES[name];
  if (!range || sat < 0.12 || l < 0.1 || l > 0.95) return false;
  const [lo, hi] = range;
  return lo < hi ? h >= lo && h < hi : h >= lo || h < hi;
}
function hueOf(r: number, g: number, b: number, max: number, d: number): number {
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

export function parse(q: string, now: number = Date.now()): Parsed {
  const chips = tokenize(q);
  const match: string[] = [];
  const where: string[] = [];
  const params: unknown[] = [];
  const post: Parsed['post'] = [];
  let trash = false;
  let plainWords = 0;
  const lastWord = [...chips].reverse().find((t) => t.kind === 'word' && !t.neg);
  const notFts = (expr: string) => { where.push('items.rowid NOT IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ?)'); params.push(expr); };

  for (const t of chips) {
    const not = t.neg ? 'NOT ' : '';
    if (t.kind === 'word' || t.kind === 'phrase') {
      const expr = ftsQuote(t.value) + (t === lastWord ? '*' : '');
      if (t.neg) notFts(expr); else { match.push(expr); if (t.kind === 'word') plainWords++; }
      continue;
    }
    const v = t.value;
    switch (t.op) {
      case 'tag':
        where.push(`items.id ${not}IN (SELECT item_id FROM tags WHERE tag = ? COLLATE NOCASE AND deleted_at IS NULL)`); params.push(v); break;
      case 'type':
        where.push(`items.type ${t.neg ? '!=' : '='} ?`); params.push(v.toLowerCase()); break;
      case 'site':
        where.push(`${not}(items.domain = ? OR items.domain LIKE ?)`); params.push(v.toLowerCase(), `%.${v.toLowerCase()}`); break;
      case 'text': {
        const expr = `{body ocr_text}:${ftsQuote(v)}`;
        if (t.neg) notFts(expr); else match.push(expr);
        break;
      }
      case 'color':
        if (/^#?[0-9a-f]{6}$/i.test(v)) { where.push(`${not}(items.colors LIKE ?)`); params.push(`%"#${v.replace('#', '').toLowerCase()}"%`); }
        else {
          const name = v.toLowerCase();
          post.push((it) => {
            let hit = false;
            try { hit = (JSON.parse(it.colors ?? '[]') as string[]).some((h) => colorMatches(name, h)); } catch { /* bad JSON = no colors */ }
            return t.neg ? !hit : hit;
          });
        }
        break;
      case 'before': case 'after': case 'on': {
        const r = parseDate(v, now);
        if (!r) break;
        const [start, end] = r;
        // "after:last week" = since the window opened; "after:may 19" = once that day ended.
        const since = end >= now ? start : end;
        const cond = t.op === 'before' ? 'items.created_at < ?' : t.op === 'after' ? 'items.created_at >= ?' : '(items.created_at >= ? AND items.created_at < ?)';
        where.push(`${not}(${cond})`);
        params.push(...(t.op === 'before' ? [start] : t.op === 'after' ? [since] : [start, end]));
        break;
      }
      case 'is':
        if (v === 'pinned') where.push(`items.pinned_at IS ${t.neg ? '' : 'NOT '}NULL`);
        else if (v === 'trash' || v === 'trashed') { if (!t.neg) trash = true; }
        else match.push(ftsQuote(`is:${v}`));
        break;
      case 'has':
        if (v === 'note') where.push(`${not}(items.body IS NOT NULL AND items.body != '')`);
        else match.push(ftsQuote(`has:${v}`));
        break;
      case 'in':
        where.push(`items.id ${not}IN (SELECT si.item_id FROM space_items si JOIN spaces s ON s.id = si.space_id WHERE (s.id = ? OR s.name = ? COLLATE NOCASE) AND si.deleted_at IS NULL AND s.deleted_at IS NULL)`);
        params.push(v, v); break;
    }
  }
  return { ftsMatch: match.length ? match.join(' AND ') : null, where, params, chips, post, trash, plainWords };
}
