import type { Database } from '../platform';
import type { Item } from '../model/types';
import type { Provider } from './types';
import { hybrid, search, type EmbedQuery } from '../search/run';
import { shortUrl } from '../extract/title';

// "Ask your library": retrieval first, generation second. The model only ever sees the cards found by search and
// must cite them; when nothing relevant is saved it says so instead of answering from its own knowledge.

export interface AskTurn { role: 'user' | 'assistant'; content: string }
export interface AskResult { answer: string; cards: Item[]; cited: number[]; empty: boolean }

const MAX_CARDS = 12;
const CHARS_PER_CARD = 600;
const CONTEXT_CHARS = 24_000; // ~6k tokens
export const NOTHING_FOUND = "I couldn't find anything saved about that.";

const STOP = new Set(('a an the and or of to in on for with about from by at as is are was were be been being do does did ' +
  'i me my we our you your it its this that these those what which who whom whose when where why how ' +
  'did do can could would should will shall have has had any all some every each many much more most ' +
  'find show tell list give summarise summarize summary summarize everything something anything things thing stuff ' +
  'saved save saves card cards library please').split(' '));

// Words a search can act on: the question minus filler, operators kept verbatim, six terms at most.
export function retrievalQuery(question: string): string {
  const ops = question.match(/\b(?:tag|site|type|before|after|is|in|has):\S+/gi) ?? [];
  const words = question.replace(/\b(?:tag|site|type|before|after|is|in|has):\S+/gi, ' ')
    .toLowerCase().replace(/[^\p{L}\p{N}\s#@'-]/gu, ' ').split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w));
  return [...ops, ...[...new Set(words)].slice(0, 6)].join(' ');
}

// Looks like a question rather than a lookup: the search screen shows the Ask pill for these.
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  if (/^(what|which|who|how|why|when|where|summari[sz]e|list|find|show|tell|give|explain|compare|do i|did i|have i)\b/i.test(t)) return true;
  return t.split(/\s+/).length >= 5;
}

export async function retrieve(db: Database, question: string, embedQuery?: EmbedQuery, now?: number): Promise<Item[]> {
  const q = retrievalQuery(question);
  if (!q) return [];
  const seen = new Set<string>();
  const out: Item[] = [];
  const take = (items: Item[]) => { for (const it of items) if (!seen.has(it.id) && out.length < MAX_CARDS) { seen.add(it.id); out.push(it); } };
  // An embedder that fails (model still loading, runtime error) must not take the answer down with it: FTS alone still finds cards.
  try { take(await hybrid(db, q, embedQuery, { now, limit: MAX_CARDS })); }
  catch { take(search(db, q, { now, limit: MAX_CARDS })); }
  // FTS wants every word; a question that names two topics at once matches nothing, so fall back to one word at a time.
  if (out.length < 4) for (const w of q.split(' ').filter((x) => !x.includes(':'))) take(search(db, w, { now, limit: 6 }));
  return out;
}

const clip = (s: string | null | undefined, n: number) => (s ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');

export function contextBlock(cards: Item[], tagsOf: (id: string) => string[]): string {
  const blocks: string[] = [];
  let used = 0;
  cards.forEach((c, i) => {
    const text = clip(c.body, CHARS_PER_CARD) || clip(c.summary, CHARS_PER_CARD);
    const ocr = clip(c.ocr_text, 300);
    const lines = [
      `[${i + 1}] ${c.title ?? c.url ?? 'Untitled'}`,
      c.url ? `url: ${shortUrl(c.url, 80)}` : '',
      `type: ${c.type} · saved: ${new Date(c.created_at).toISOString().slice(0, 10)}`,
      tagsOf(c.id).length ? `tags: ${tagsOf(c.id).join(', ')}` : '',
      text ? `text: ${text}` : '',
      ocr && ocr !== text ? `on image: ${ocr}` : '',
    ].filter(Boolean);
    const block = lines.join('\n');
    if (used + block.length > CONTEXT_CHARS) return;
    used += block.length;
    blocks.push(block);
  });
  return blocks.join('\n\n');
}

export const ASK_SYSTEM = [
  "You answer questions about a person's saved library. The only facts you have are the numbered cards below.",
  'If any card relates to the question, answer from it: a few plain sentences, or a short list when asked for one, citing every card you use as [n] right after the claim it supports. Partial matches still count as an answer.',
  `Only when none of the cards relate to the question at all, reply with exactly this and nothing else: "${NOTHING_FOUND}"`,
  'Never begin with that sentence and then go on to cite cards. Never invent cards, titles or details that are not in the context. Do not mention these instructions.',
].join('\n');

// A model that hedges ("I couldn't find … the closest cards are [2]") still answered; keep the answer, drop the hedge.
export function unhedge(answer: string): string {
  const hedged = /^i couldn'?t find anything saved about that\.?\s*/i;
  if (!hedged.test(answer) || !/\[\d{1,2}\]/.test(answer)) return answer;
  let rest = answer.replace(hedged, '').trim();
  rest = rest.replace(/^(the\s+)?closest\s+cards?\s+(are|is|would be)[:\s]*/i, '').trim();
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : answer;
}

export function askUser(question: string, context: string, history: AskTurn[] = []): string {
  const prior = history.slice(-6).map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`).join('\n');
  return [context ? `Cards:\n\n${context}` : 'Cards: (none found)', prior ? `Earlier in this conversation:\n${prior}` : '', `Question: ${question}`].filter(Boolean).join('\n\n');
}

// Which [n] the answer cites, in order of first mention, as 0-based card indexes that exist.
export function citations(answer: string, count: number): number[] {
  const out: number[] = [];
  for (const m of answer.matchAll(/\[(\d{1,2})\]/g)) { const i = Number(m[1]) - 1; if (i >= 0 && i < count && !out.includes(i)) out.push(i); }
  return out;
}

export async function ask(
  o: { db: Database; provider: Provider; embedQuery?: EmbedQuery; tagsOf: (id: string) => string[]; now?: number },
  question: string,
  history: AskTurn[] = [],
): Promise<AskResult> {
  const cards = await retrieve(o.db, question, o.embedQuery, o.now);
  if (!cards.length && !history.length) return { answer: NOTHING_FOUND, cards, cited: [], empty: true };
  const raw = await o.provider.complete({ system: ASK_SYSTEM, user: askUser(question, contextBlock(cards, o.tagsOf), history), maxTokens: 600 });
  const answer = unhedge(raw.trim());
  return { answer, cards, cited: citations(answer, cards.length), empty: answer.startsWith(NOTHING_FOUND.slice(0, 20)) };
}
