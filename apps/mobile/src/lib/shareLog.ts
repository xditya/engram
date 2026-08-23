import { create } from 'zustand';

// Last few things the capture path saw, for the Share diagnostics screen. In memory only.
type Entry = { at: number; kind: 'link' | 'share' | 'error'; text: string };
export const useShareLog = create<{ entries: Entry[]; add(kind: Entry['kind'], text: string): void }>((set) => ({
  entries: [],
  add: (kind, text) => set((s) => ({ entries: [{ at: Date.now(), kind, text }, ...s.entries].slice(0, 20) })),
}));
