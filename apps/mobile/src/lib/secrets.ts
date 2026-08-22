import type { KeyStore } from '@engram/core';

// Everything that must never land in settings.json. 'google' (OAuth tokens) is managed by auth.ts.
export type SecretName = 'apiKey' | 'webdavPassword';
export type Secrets = ReturnType<typeof createSecrets>;

export const hex = {
  encode: (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''),
  decode: (s: string) => new Uint8Array(s.match(/../g)?.map((h) => parseInt(h, 16)) ?? []),
};

// Small cache over the KeyStore so provider construction (every queue tick) stays synchronous.
export function createSecrets(keys: KeyStore) {
  const cache = new Map<SecretName, string | null>();
  const NAMES: SecretName[] = ['apiKey', 'webdavPassword'];
  return {
    async load() { for (const n of NAMES) cache.set(n, await keys.get(n)); },
    get: (name: SecretName): string | null => cache.get(name) ?? null,
    async set(name: SecretName, value: string | null) {
      cache.set(name, value);
      if (value == null) await keys.delete(name); else await keys.set(name, value);
    },
    // 16 bytes of entropy = the master key the user holds as 12 words. Generated on first sync setup.
    master: {
      get: async (): Promise<Uint8Array | null> => { const h = await keys.get('master'); return h ? hex.decode(h) : null; },
      // A new key means the old phrase no longer applies; 'phraseSaved' describes the key it sits next to.
      set: async (entropy: Uint8Array) => { await keys.delete('phraseSaved'); await keys.set('master', hex.encode(entropy)); },
      clear: async () => { await keys.delete('phraseSaved'); await keys.delete('master'); },
    },
  };
}
