import { create } from 'zustand';
import { File, Paths } from 'expo-file-system';
import type { IntelligenceSettings } from '@engram/core';

export type SyncBackend = 'off' | 'gdrive' | 'icloud' | 'webdav';
export interface Settings {
  intelligence: IntelligenceSettings;
  sync: { backend: SyncBackend; webdav?: { baseUrl: string; username: string }; deviceName: string };
  ui: { view: 'grid' | 'list'; density: 'comfortable' | 'cozy' | 'compact'; sort: 'saved' | 'modified' | 'opened' | 'title'; traceIndicator: boolean };
  advanced: { googleClientId?: string };
  capture: { screenshotWatch: boolean }; // Android: the background screenshot watcher
  spend: { month: string; usd: number }; // AI spend, reset when the month changes
  onboarded: boolean;
}

export const DEFAULTS: Settings = {
  intelligence: { mode: 'off', summaries: true, describeImages: false },
  sync: { backend: 'off', deviceName: 'Phone' },
  ui: { view: 'grid', density: 'cozy', sort: 'saved', traceIndicator: true },
  advanced: {},
  capture: { screenshotWatch: false },
  spend: { month: '', usd: 0 },
  onboarded: false,
};

// Non-secret settings live in one JSON file (no AsyncStorage). Secrets (API key, WebDAV password, Google
// tokens, master key) live in the KeyStore: see engram.secrets.
const file = () => new File(Paths.document, 'settings.json');
function load(): Settings {
  try {
    const f = file();
    if (!f.exists) return DEFAULTS;
    const saved = JSON.parse(f.textSync()) as Partial<Settings>;
    const out = { ...DEFAULTS, ...saved };
    for (const k of ['intelligence', 'sync', 'ui', 'advanced', 'capture', 'spend'] as const) (out as Record<string, unknown>)[k] = { ...DEFAULTS[k], ...saved[k] };
    return out;
  } catch { return DEFAULTS; } // web, or a corrupt file: start from defaults
}

type Store = Settings & {
  update(patch: Partial<Settings>): void;
  patch<K extends Exclude<keyof Settings, 'onboarded'>>(key: K, value: Partial<Settings[K]>): void;
};

export const useSettings = create<Store>((set) => ({
  ...load(),
  update: (p) => set(p),
  patch: (k, v) => set((s) => ({ [k]: { ...s[k], ...v } }) as Partial<Settings>),
}));

let timer: ReturnType<typeof setTimeout> | undefined;
useSettings.subscribe((s) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const { update: _u, patch: _p, ...data } = s;
    try { file().write(JSON.stringify(data)); } catch { /* web: settings are per-session */ }
  }, 250);
});

export const getSettings = (): Settings => useSettings.getState();
