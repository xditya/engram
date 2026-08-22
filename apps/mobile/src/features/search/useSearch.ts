import { useEffect, useRef, useState } from 'react';
import { ai, search as core, type Item } from '@engram/core';
import { engram, getSettings, useEngram } from '../../lib/engram';

export type Hit = Item & { semantic?: boolean };

function embedQuery(): core.EmbedQuery | undefined {
  const e = engram();
  const s = getSettings().intelligence;
  if (s.mode === 'off') return undefined;
  const onDevice = e.platform.onDevice?.loaded ? e.platform.onDevice : undefined;
  const provider = ai.createProvider(s, { apiKey: e.secrets.get('apiKey') ?? undefined }, { fetch, onDevice });
  const embedder = ai.createEmbedder(s, provider, { onDevice });
  if (!embedder?.embed) return undefined;
  return async (text) => {
    const { vectors, model } = await embedder.embed!([text]);
    return vectors[0] ? { vec: vectors[0], model } : null;
  };
}

// Local FTS on every keystroke; semantic neighbours (hybrid) appended ~300 ms later when Intelligence is on.
export function useSearch(query: string) {
  const { engram: e } = useEngram();
  const [state, setState] = useState<{ hits: Hit[]; ms: number }>({ hits: [], ms: 0 });
  const gen = useRef(0);
  const q = query.trim();

  useEffect(() => {
    if (!e || !q) { setState({ hits: [], ms: 0 }); return; }
    const my = ++gen.current;
    const t0 = performance.now();
    const hits: Hit[] = core.search(e.platform.db, q, { now: e.platform.now() });
    setState({ hits, ms: performance.now() - t0 });

    const embed = embedQuery();
    if (!embed) return;
    const timer = setTimeout(async () => {
      try {
        const fused = await core.hybrid(e.platform.db, q, embed, { now: e.platform.now() });
        if (my !== gen.current) return;
        const seen = new Set(hits.map((h) => h.id));
        const extra = fused.filter((i) => !seen.has(i.id)).map((i): Hit => ({ ...i, semantic: true }));
        if (extra.length) setState((s) => ({ ...s, hits: [...hits, ...extra] }));
      } catch { /* semantic is optional */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [e, q]);

  return state;
}
