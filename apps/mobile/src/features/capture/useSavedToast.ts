import { useCallback } from 'react';
import { engram, getSettings, useToast } from '../../lib/engram';

// "Saved" right away; "Saved · tagging…" (a few seconds) while classify jobs are still running, then
// "Saved · N tags" if the tags land within 15 s. Jobs stuck pending (no provider yet) never hold the toast.
// Job rows are written outside the change bus, so we poll as well as listen (tags themselves do emit).
export function useSavedToast() {
  const show = useToast((s) => s.show);
  return useCallback((ids: string[]) => {
    const e = engram();
    const ph = ids.map(() => '?').join(',');
    if (getSettings().intelligence.mode === 'off' || !ids.length) return show('Saved');
    const busy = () => e.platform.db.query<{ n: number }>(`SELECT count(*) n FROM jobs WHERE item_id IN (${ph}) AND kind='classify' AND status IN ('pending','running')`, ids)[0]?.n ?? 0;
    const tags = () => e.platform.db.query<{ n: number }>(`SELECT count(DISTINCT tag) n FROM tags WHERE item_id IN (${ph}) AND deleted_at IS NULL`, ids)[0]?.n ?? 0;
    const label = (n: number) => (n ? `Saved · ${n} ${n === 1 ? 'tag' : 'tags'}` : 'Saved');
    if (!busy()) return show(label(tags()));
    show('Saved · tagging…', 6000);
    const stop = () => { off(); clearInterval(poll); clearTimeout(t); };
    const settle = () => { if (busy()) return; stop(); const n = tags(); if (n) show(label(n)); };
    const off = e.events.on(settle);
    const poll = setInterval(settle, 2000);
    const t = setTimeout(stop, 15_000);
  }, [show]);
}
