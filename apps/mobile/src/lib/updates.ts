import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';
import { RELEASE_COMMIT, RELEASE_TAG } from './release';

// Release checker: the app knows which release tag it was built from (CI bakes it in) and asks the GitHub
// releases feed whether anything newer exists. No server of ours, one unauthenticated request, at most every 6 h.
export const REPO = 'xditya/engram';
export const RELEASES_PAGE = 'https://engram.xditya.me/releases.html';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const EVERY = 6 * 60 * 60 * 1000;

export interface Release { tag: string; name: string; notes: string; publishedAt: number; prerelease: boolean; url: string }
interface Cache { checkedAt: number; latest?: Release; between: Release[]; dismissedTag?: string }
type State = Cache & {
  checking: boolean;
  open: boolean;
  setOpen(v: boolean): void;
  dismiss(): void;
  check(force?: boolean): Promise<'newer' | 'current' | 'unknown' | 'offline'>;
};

// The tag is a source file the workflow stamps before building: env vars and app.config `extra` both proved
// unreliable (plugins replace `extra`, and the inlined env is easy to lose between runners).
export const currentTag = RELEASE_TAG !== 'dev' ? RELEASE_TAG : null;
export const currentCommit = RELEASE_COMMIT;
export const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

const file = () => new File(Paths.document, 'updates.json');
const load = (): Cache => { try { return file().exists ? (JSON.parse(file().textSync()) as Cache) : { checkedAt: 0, between: [] }; } catch { return { checkedAt: 0, between: [] }; } };
const save = (c: Cache) => { try { file().write(JSON.stringify(c)); } catch { /* web */ } };

// Newer = published after the release this build came from. CI builds (build-N) count only when this build is one.
export function newerThanCurrent(all: Release[], current: string | null): { latest?: Release; between: Release[] } {
  const mine = current ? all.find((r) => r.tag === current) : undefined;
  if (!mine) return { between: [] };
  const ci = /^build-\d+$/.test(current!);
  const newer = all.filter((r) => r.publishedAt > mine.publishedAt && (ci || !/^build-\d+$/.test(r.tag))).sort((a, b) => b.publishedAt - a.publishedAt);
  return { latest: newer[0], between: newer };
}

export const useUpdates = create<State>((set, get) => ({
  ...load(),
  checking: false,
  open: false,
  setOpen: (open) => set({ open }),
  dismiss: () => { const c = { ...get(), dismissedTag: get().latest?.tag }; set({ dismissedTag: c.dismissedTag }); save({ checkedAt: c.checkedAt, latest: c.latest, between: c.between, dismissedTag: c.dismissedTag }); },
  async check(force = false) {
    const s = get();
    if (!force && Date.now() - s.checkedAt < EVERY) return s.latest ? 'newer' : currentTag ? 'current' : 'unknown';
    if (s.checking) return 'unknown';
    set({ checking: true });
    try {
      const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { tag_name: string; name: string; body: string; published_at: string; prerelease: boolean; draft: boolean; html_url: string }[];
      const all: Release[] = data.filter((r) => !r.draft).map((r) => ({ tag: r.tag_name, name: r.name || r.tag_name, notes: r.body ?? '', publishedAt: Date.parse(r.published_at), prerelease: r.prerelease, url: r.html_url }));
      const { latest, between } = newerThanCurrent(all, currentTag);
      const next: Cache = { checkedAt: Date.now(), latest, between, dismissedTag: s.dismissedTag };
      set(next); save(next);
      return latest ? 'newer' : currentTag ? 'current' : 'unknown';
    } catch {
      set({ checking: false });
      return 'offline';
    } finally { set({ checking: false }); }
  },
}));
