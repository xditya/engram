// No-model tags: the handful of terms a card is obviously "about" — proper nouns from the title and words that
// repeat in the body/OCR text — plus the site it came from. Conservative on purpose; a model does the rest.
import { isTag } from './autotag';

const STOP = new Set(('a an the and or but if then else of in on at to for from by with without about as into onto over under ' +
  'is are was were be been being am do does did done have has had having can could may might must shall should will would ' +
  'this that these those it its itself they them their there here where when why how what which who whom whose ' +
  'i me my mine we us our you your he him his she her hers not no nor so too very just only also than more most less least ' +
  'all any some such each every both few many much own other another same new old first last next one two three ' +
  'up down out off again further once ever never always often still yet already now today http https www com org net html ' +
  'get got make made like use used using via per etc amp nbsp').split(/\s+/));

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s'-]+/gu, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w));

export function extractKeywords(title: string | null | undefined, text: string | null | undefined, max = 5): string[] {
  const out = new Map<string, number>();
  // Capitalised runs in the title (proper nouns: "React Native", "Memex") score highest.
  for (const m of (title ?? '').matchAll(/\b(\p{Lu}[\p{L}\p{N}'-]{2,}(?:\s+\p{Lu}[\p{L}\p{N}'-]{2,}){0,2})\b/gu)) {
    const k = m[1]!.toLowerCase();
    if (!k.split(/\s+/).every((w) => STOP.has(w))) out.set(k, (out.get(k) ?? 0) + 3);
  }
  const body = words((text ?? '').slice(0, 8000));
  const counts = new Map<string, number>();
  for (const w of body) counts.set(w, (counts.get(w) ?? 0) + 1);
  for (const [w, n] of counts) if (n >= 2) out.set(w, (out.get(w) ?? 0) + n);
  for (const w of words(title ?? '')) out.set(w, (out.get(w) ?? 0) + 2);
  const ranked = [...out.entries()].filter(([k]) => k.length <= 32 && isTag(k)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  // A phrase ("example domain") absorbs its own words so the list doesn't say the same thing three times.
  const phrases = ranked.filter((k) => k.includes(' ')).slice(0, max);
  return ranked.filter((k) => k.includes(' ') || !phrases.some((p) => p.split(' ').includes(k))).slice(0, max);
}

// "en.wikipedia.org" -> "wikipedia"; "news.ycombinator.com" -> "ycombinator"; null for bare IPs/localhost.
export function siteTag(domain: string | null | undefined): string | null {
  if (!domain || /^(\d+\.){3}\d+$/.test(domain) || domain === 'localhost') return null;
  const parts = domain.toLowerCase().replace(/^www\./, '').split('.');
  const tld2 = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);
  const core = parts.length >= 3 && tld2.has(parts[parts.length - 2]!) ? parts[parts.length - 3] : parts[parts.length - 2] ?? parts[0];
  return core && core.length >= 2 ? core : null;
}
