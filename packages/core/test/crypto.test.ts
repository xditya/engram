import { describe, expect, it } from 'vitest';
import {
  CHUNK, OVERHEAD, blake3Hex, decodeManifest, encodeManifest, keyCheck, linkOffer, masterKey, open, openChunks,
  openFromPeer, remoteKeyFor, seal, sealChunks, sealForPeer, unwrapKey, verifyKeyCheck, wrapKey,
} from '../src/crypto';

const fast = { t: 1, m: 256 }; // argon2id test params; production default is 64 MiB
const entropy = masterKey.generate();
const { dataKey, hmacKey } = masterKey.deriveKeys(entropy);
const bytes = (n: number, seed = 7) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * seed) & 0xff; return b; };
const same = (a: Uint8Array, b: Uint8Array) => expect(blake3Hex(a)).toBe(blake3Hex(b)); // toEqual is O(n) slow on MiB arrays
const utf8 = (s: string) => new TextEncoder().encode(s);

describe('masterKey', () => {
  it('12-word phrase round-trips and rejects garbage', () => {
    const phrase = masterKey.toPhrase(entropy);
    expect(phrase.split(' ')).toHaveLength(12);
    expect(masterKey.fromPhrase('  ' + phrase.toUpperCase() + '\n')).toEqual(entropy);
    expect(() => masterKey.fromPhrase(phrase.replace(/^\w+/, 'zzzzz'))).toThrow();
    expect(() => masterKey.fromPhrase('abandon abandon abandon')).toThrow();
  });
  it('derives distinct deterministic keys', () => {
    expect(masterKey.deriveKeys(entropy)).toEqual({ dataKey, hmacKey });
    expect(dataKey).toHaveLength(32);
    expect(dataKey).not.toEqual(hmacKey);
  });
});

describe('envelope', () => {
  it('round-trips, detects tamper and wrong key/aad', () => {
    const pt = bytes(1000);
    const aad = new Uint8Array([1, 2, 3]);
    const s = seal(dataKey, pt, aad);
    expect(s).toHaveLength(pt.length + OVERHEAD);
    expect(open(dataKey, s, aad)).toEqual(pt);
    expect(open(dataKey, seal(dataKey, new Uint8Array(0)))).toEqual(new Uint8Array(0));
    const t = s.slice();
    t[40]! ^= 1;
    expect(() => open(dataKey, t, aad)).toThrow();
    expect(() => open(dataKey, s)).toThrow();
    expect(() => open(hmacKey, s, aad)).toThrow();
    expect(seal(dataKey, pt, aad)).not.toEqual(s); // fresh nonce each time
  });
  it('chunks at exact boundaries and rejects truncation/reorder', () => {
    for (const n of [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 2 * CHUNK, 2 * CHUNK + 5]) {
      const pt = bytes(n);
      const s = sealChunks(dataKey, pt);
      expect(s).toHaveLength(n + Math.max(1, Math.ceil(n / CHUNK)) * OVERHEAD);
      same(openChunks(dataKey, s), pt);
    }
    const s = sealChunks(dataKey, bytes(2 * CHUNK + 5));
    const one = CHUNK + OVERHEAD;
    expect(() => openChunks(dataKey, s.subarray(0, one))).toThrow(); // dropped tail
    expect(() => openChunks(dataKey, s.subarray(0, 2 * one))).toThrow();
    const swapped = new Uint8Array(s);
    swapped.set(s.subarray(one, 2 * one), 0);
    swapped.set(s.subarray(0, one), one);
    expect(() => openChunks(dataKey, swapped)).toThrow();
  }, 30_000);
});

describe('remote keys', () => {
  it('are deterministic, keyed and 32 hex chars', () => {
    const h = blake3Hex(bytes(10));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(blake3Hex(bytes(10))).toBe(h);
    const k = remoteKeyFor(hmacKey, h);
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(remoteKeyFor(hmacKey, h)).toBe(k);
    expect(remoteKeyFor(dataKey, h)).not.toBe(k);
    expect(remoteKeyFor(hmacKey, blake3Hex(bytes(11)))).not.toBe(k);
  });
});

describe('wrapKey', () => {
  it('unwraps with the right passphrase only', () => {
    const w = wrapKey(entropy, 'correct horse', undefined, fast);
    expect(unwrapKey(w, 'correct horse')).toEqual(entropy);
    expect(() => unwrapKey(w, 'wrong horse')).toThrow();
    const t = w.slice();
    t[1] = 2; // tampered KDF params in header
    expect(() => unwrapKey(t, 'correct horse')).toThrow();
  });
});

describe('device linking', () => {
  it('round-trips through a 6-digit code', () => {
    const { code } = linkOffer();
    expect(code).toMatch(/^\d{6}$/);
    const s = sealForPeer(code, entropy, fast);
    expect(openFromPeer(code, s)).toEqual(entropy);
    const other = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    expect(() => openFromPeer(other, s)).toThrow();
  });
});

describe('manifest', () => {
  it('round-trips and key check identifies the phrase', () => {
    const m = { schemaVersion: 1, devices: { d1: { name: 'Phone', lastSeen: 1, lastBatch: null } }, keyCheck: keyCheck(hmacKey) };
    const s = encodeManifest(dataKey, m);
    expect(decodeManifest(dataKey, s)).toEqual(m);
    expect(verifyKeyCheck(hmacKey, m.keyCheck)).toBe(true);
    expect(verifyKeyCheck(masterKey.deriveKeys(masterKey.generate()).hmacKey, m.keyCheck)).toBe(false);
    expect(() => decodeManifest(hmacKey, s)).toThrow();
    expect(() => decodeManifest(dataKey, seal(dataKey, utf8('{}'), utf8('manifest')))).toThrow();
  });
});
