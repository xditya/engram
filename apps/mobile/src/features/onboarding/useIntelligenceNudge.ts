import { useState } from 'react';
import { File, Paths } from 'expo-file-system';
import { useRouter, type Href } from 'expo-router';
import { useLiveQuery, useSettings } from '../../lib/engram';

export const NUDGE = 'Turn on Intelligence to get tags and summaries';
const mark = () => new File(Paths.document, 'intelligence-nudge-shown');
const shown = () => { try { return mark().exists; } catch { return false; } };

// Library row after the 20th save with Intelligence off. Dismiss or act once and it never returns.
export function useIntelligenceNudge() {
  const router = useRouter();
  const off = useSettings((s) => s.intelligence.mode === 'off');
  const [done, setDone] = useState(shown);
  const twenty = useLiveQuery((e) => e.db.items.list({ limit: 1, offset: 19 }).length === 1, []);
  const dismiss = () => { setDone(true); try { mark().create(); } catch { /* web: per-session */ } };
  return {
    visible: off && !done && !!twenty,
    text: NUDGE,
    dismiss,
    open: () => { dismiss(); router.push('/settings/intelligence' as Href); },
  };
}
