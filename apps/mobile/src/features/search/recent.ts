import { create } from 'zustand';
import { File, Paths } from 'expo-file-system';

// Last 10 queries. Own JSON file because the shared settings store has no slot for it.
const file = () => new File(Paths.document, 'recent-searches.json');
const load = (): string[] => { try { return file().exists ? (JSON.parse(file().textSync()) as string[]) : []; } catch { return []; } };

export const useRecent = create<{ list: string[]; add(q: string): void }>((set) => ({
  list: load(),
  add: (q) => set((s) => ({ list: [q, ...s.list.filter((x) => x !== q)].slice(0, 10) })),
}));
useRecent.subscribe((s) => { try { file().write(JSON.stringify(s.list)); } catch { /* web */ } });
