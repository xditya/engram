import { useCallback, useEffect, useRef, useState } from 'react';
import { ai, search as core, type Item } from '@engram/core';
import { engram, getSettings } from '../../lib/engram';

export type AskStatus = 'idle' | 'thinking' | 'done' | 'error';
export interface AskState { status: AskStatus; question: string; answer: string; cards: Item[]; cited: number[]; empty: boolean; error?: string }

const IDLE: AskState = { status: 'idle', question: '', answer: '', cards: [], cited: [], empty: false };

// The chat provider from the Intelligence settings, or null when Ask is not available (mode off, key missing,
// on-device model not loaded yet). Mirrors what search does for embeddings.
export function askProvider(): { provider: ai.Provider; name: string; onDevice: boolean } | null {
  const s = getSettings().intelligence;
  if (s.mode === 'off') return null;
  const e = engram();
  // The on-device model may still be loading; ask() waits for ready() before the first question.
  const onDevice = s.mode === 'on-device' ? e.platform.onDevice : e.platform.onDevice?.loaded ? e.platform.onDevice : undefined;
  if (s.mode === 'on-device' && !onDevice) return null;
  const provider = ai.createProvider(s, { apiKey: e.secrets.get('apiKey') ?? undefined }, { fetch, onDevice });
  if (!provider || !provider.capabilities().chat) return null;
  const name = s.mode === 'on-device' ? 'this device' : (s.provider ?? 'your provider');
  return { provider, name, onDevice: s.mode === 'on-device' };
}

function embedQuery(): core.EmbedQuery | undefined {
  const s = getSettings().intelligence;
  if (s.mode === 'off') return undefined;
  const e = engram();
  const onDevice = e.platform.onDevice?.loaded ? e.platform.onDevice : undefined;
  const provider = ai.createProvider(s, { apiKey: e.secrets.get('apiKey') ?? undefined }, { fetch, onDevice });
  const embedder = provider ? ai.createEmbedder(s, provider, { onDevice }) : null;
  if (!embedder?.embed) return undefined;
  return async (text) => { const { vectors, model } = await embedder.embed!([text]); return vectors[0] ? { vec: vectors[0], model } : null; };
}

// Results for a question-shaped query: the same retrieval ask() uses (hybrid, then one word at a time), so the
// list under the answer is never empty just because FTS wanted every word of the question.
export function useRetrieve(query: string, enabled: boolean): { hits: Item[]; ms: number } {
  const [state, setState] = useState<{ hits: Item[]; ms: number }>({ hits: [], ms: 0 });
  const gen = useRef(0);
  const q = query.trim();
  useEffect(() => {
    if (!enabled || !q) { setState({ hits: [], ms: 0 }); return; }
    const my = ++gen.current;
    const t0 = performance.now();
    const e = engram();
    const embed = embedQuery();
    const run = async () => {
      let hits: Item[] = [];
      try { hits = await ai.retrieve(e.platform.db, q, embed, e.platform.now()); } catch { /* shown as no results */ }
      if (my === gen.current) setState({ hits, ms: performance.now() - t0 });
    };
    const t = setTimeout(() => void run(), 150);
    return () => clearTimeout(t);
  }, [q, enabled]);
  return state;
}

// One conversation per search screen: turns live in memory for as long as the screen does.
export function useAsk() {
  const [state, setState] = useState<AskState>(IDLE);
  const turns = useRef<ai.AskTurn[]>([]);
  const gen = useRef(0);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    const p = askProvider();
    if (!q || !p) return;
    const my = ++gen.current;
    setState({ ...IDLE, status: 'thinking', question: q });
    const e = engram();
    try {
      if (p.onDevice && !e.platform.onDevice?.loaded && !(await e.platform.onDevice!.ready())) throw new Error('the on-device model is not ready');
      const r = await ai.ask(
        { db: e.platform.db, provider: p.provider, embedQuery: embedQuery(), tagsOf: (id) => e.db.tags.of(id), now: e.platform.now() },
        q, turns.current,
      );
      if (my !== gen.current) return;
      turns.current = [...turns.current, { role: 'user' as const, content: q }, { role: 'assistant' as const, content: r.answer }].slice(-6);
      setState({ status: 'done', question: q, answer: r.answer, cards: r.cards, cited: r.cited, empty: r.empty });
    } catch (err) {
      if (my !== gen.current) return;
      setState({ ...IDLE, status: 'error', question: q, error: (err as Error).message });
    }
  }, []);

  const reset = useCallback(() => { gen.current++; turns.current = []; setState(IDLE); }, []);
  return { state, ask, reset, followUps: turns.current.length > 0 };
}
