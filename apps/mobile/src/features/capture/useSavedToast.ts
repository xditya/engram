import { useCallback } from 'react';
import { engram, getSettings, useToast } from '../../lib/engram';

// "Saved · tagging…" until the classify jobs for these items settle, then "Saved · N tags".
// Job rows are written outside the change bus, so we re-check on every db change (tags land through it).
export function useSavedToast() {
  const show = useToast((s) => s.show);
  return useCallback((ids: string[]) => {
    const e = engram();
    const ph = ids.map(() => '?').join(',');
    if (getSettings().intelligence.mode === 'off' || !ids.length) return show('Saved');
    const check = () => {
      const busy = e.platform.db.query<{ n: number }>(`SELECT count(*) n FROM jobs WHERE item_id IN (${ph}) AND kind='classify' AND status IN ('pending','running')`, ids)[0]?.n ?? 0;
      if (busy) return show('Saved · tagging…', 30_000), false;
      const tags = e.platform.db.query<{ n: number }>(`SELECT count(DISTINCT tag) n FROM tags WHERE item_id IN (${ph}) AND deleted_at IS NULL`, ids)[0]?.n ?? 0;
      show(tags ? `Saved · ${tags} ${tags === 1 ? 'tag' : 'tags'}` : 'Saved');
      return true;
    };
    if (check()) return;
    const off = e.events.on(() => { if (check()) { off(); clearTimeout(t); } });
    const t = setTimeout(off, 60_000); // ponytail: give up listening after a minute; toast just stays "Saved"
  }, [show]);
}
