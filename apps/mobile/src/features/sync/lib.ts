import { Platform as RN } from 'react-native';
import { crypto, type Manifest, type SyncEngine } from '@engram/core';
import { wordlist } from '@scure/bip39/wordlists/english';
import type { Engram } from '../../lib/engram';
import type { SyncBackend } from '../../lib/settings';

export const BACKEND_NAME: Record<SyncBackend, string> = { off: 'This device only', gdrive: 'Google Drive', icloud: 'iCloud', webdav: 'server' };

export const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function relative(t: number, now = Date.now()): string {
  const d = Math.floor((now - t) / 86_400_000);
  if (d < 1) return hhmm(t);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  const mo = Math.floor(d / 30);
  return `${mo} month${mo === 1 ? '' : 's'} ago`;
}

export const isWord = (w: string) => wordlist.includes(w.toLowerCase());
export const WORDS = wordlist;

// Whether the recovery phrase was saved or confirmed. Lives in the KeyStore next to the key it describes.
const SAVED = 'phraseSaved';
export const phraseSaved = {
  get: (e: Engram) => e.platform.keys.get(SAVED),
  set: (e: Engram, how: string) => e.platform.keys.set(SAVED, `${how}|${Date.now()}`),
};

// Fresh device: the recovery phrase lives in the password manager.
export const KEYCHAIN = { service: 'app.engram.recovery', user: 'engram recovery phrase' };
export const passwordManagerName = () => (RN.OS === 'ios' ? 'iCloud Keychain' : 'the device keystore');

export const deviceIcon = (name: string) => {
  const n = name.toLowerCase();
  if (/ipad|tablet|tab\b/.test(n)) return 'device-tablet' as const;
  if (/mac|pc|desktop|laptop|windows|linux/.test(n)) return 'device-desktop' as const;
  if (/browser|chrome|firefox|safari|web/.test(n)) return 'device-browser' as const;
  return 'device-phone' as const;
};

export const unresolvedErrors = (e: Engram) =>
  e.platform.db.query<{ n: number }>('SELECT count(*) AS n FROM sync_errors WHERE resolved = 0')[0]?.n ?? 0;

// ponytail: the engine only records bad files; marking them resolved and syncing again is the whole retry.
export const retryErrors = (e: Engram) => { e.platform.db.exec('UPDATE sync_errors SET resolved = 1'); return e.sync.syncNow(); };

export const LINK_TTL_MS = crypto.LINK_TTL_MS;
export const newLinkCode = () => crypto.linkOffer().code;

// Reading a link offer needs a storage adapter, which the hub only builds behind a master key. A throwaway key gets
// the engine built; the real one replaces it on success, nothing stays behind on failure.
// ponytail: replace with a hub `sync.readLinkOffer(code)` that opens storage without a key.
export async function claimLinkOffer(e: Engram, code: string): Promise<boolean> {
  const had = await e.secrets.master.get();
  if (!had) await e.secrets.master.set(crypto.masterKey.generate());
  e.sync.reset();
  try {
    const engine = await e.sync.getEngine();
    const entropy = await engine?.readLinkOffer(code);
    if (!entropy) { if (!had) await e.sync.masterKey.clear(); return false; }
    await e.secrets.master.set(entropy);
    e.sync.reset();
    return true;
  } catch (err) {
    if (!had) await e.sync.masterKey.clear();
    throw err;
  }
}

// Devices come from the remote manifest. updateManifest also stamps this device's lastSeen, which is what a sync does anyway.
export const readDevices = (engine: SyncEngine): Promise<Manifest> => engine.updateManifest();

// ponytail: the engine has no device removal yet; surface that honestly instead of pretending.
export async function removeDevice(engine: SyncEngine, id: string): Promise<void> {
  const e = engine as SyncEngine & { removeDevice?: (id: string) => Promise<void> };
  if (!e.removeDevice) throw new Error("Removing devices isn't available in this version yet.");
  await e.removeDevice(id);
}
