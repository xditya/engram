// E2EE primitives. Pure @noble/@scure; no platform crypto so the same code runs on Hermes, browsers and Node.
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { argon2id } from '@noble/hashes/argon2';
import { blake3 } from '@noble/hashes/blake3';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, bytesToUtf8, concatBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils';
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

// ---- master key -------------------------------------------------------------
// The 16 bytes of entropy ARE the master key the user holds (12 BIP39 words). Working keys are
// HKDF-SHA256(entropy, salt = 'engram', info = purpose): 'data' encrypts everything, 'hmac' names
// remote blobs and produces the key check. Keys can never rotate without re-encrypting the library.
export const masterKey = {
  generate: (): Uint8Array => randomBytes(16),
  toPhrase: (entropy: Uint8Array): string => entropyToMnemonic(entropy, wordlist),
  fromPhrase(words: string): Uint8Array {
    const phrase = words.trim().toLowerCase().split(/\s+/).join(' ');
    if (!validateMnemonic(phrase, wordlist)) throw new Error('invalid recovery phrase');
    return mnemonicToEntropy(phrase, wordlist);
  },
  deriveKeys: (entropy: Uint8Array): { dataKey: Uint8Array; hmacKey: Uint8Array } => ({
    dataKey: hkdf(sha256, entropy, utf8ToBytes('engram'), utf8ToBytes('data'), 32),
    hmacKey: hkdf(sha256, entropy, utf8ToBytes('engram'), utf8ToBytes('hmac'), 32),
  }),
};

// ---- envelope ---------------------------------------------------------------
// Layout: [version=1][nonce 24][ciphertext+tag]. Version byte is the only header field; a key id
// is added here when key rotation exists, since the byte is already checked on open.
const VERSION = 1;
const NONCE = 24;
const TAG = 16;
export const OVERHEAD = 1 + NONCE + TAG;

export function seal(key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Uint8Array {
  const nonce = randomBytes(NONCE);
  return concatBytes(new Uint8Array([VERSION]), nonce, xchacha20poly1305(key, nonce, aad).encrypt(plaintext));
}

export function open(key: Uint8Array, sealed: Uint8Array, aad?: Uint8Array): Uint8Array {
  if (sealed.length < OVERHEAD || sealed[0] !== VERSION) throw new Error('bad envelope');
  return xchacha20poly1305(key, sealed.subarray(1, 1 + NONCE), aad).decrypt(sealed.subarray(1 + NONCE));
}

// Each chunk is its own envelope; the chunk index and a last-chunk flag ride in the AAD so the
// remote cannot reorder, drop or truncate chunks without failing authentication.
export const CHUNK = 1 << 20;
const chunkAad = (aad: Uint8Array | undefined, i: number, last: boolean) => {
  const tail = new Uint8Array(5);
  new DataView(tail.buffer).setUint32(0, i);
  tail[4] = last ? 1 : 0;
  return aad ? concatBytes(aad, tail) : tail;
};

export function sealChunks(key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Uint8Array {
  const n = Math.max(1, Math.ceil(plaintext.length / CHUNK));
  const parts: Uint8Array[] = [];
  for (let i = 0; i < n; i++)
    parts.push(seal(key, plaintext.subarray(i * CHUNK, (i + 1) * CHUNK), chunkAad(aad, i, i === n - 1)));
  return concatBytes(...parts);
}

export function openChunks(key: Uint8Array, sealed: Uint8Array, aad?: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  const full = CHUNK + OVERHEAD;
  for (let i = 0, off = 0; ; i++) {
    const end = Math.min(off + full, sealed.length);
    parts.push(open(key, sealed.subarray(off, end), chunkAad(aad, i, end === sealed.length)));
    if (end === sealed.length) return concatBytes(...parts);
    off = end;
  }
}

// ---- hashing / remote names -------------------------------------------------
export const blake3Hex = (bytes: Uint8Array): string => bytesToHex(blake3(bytes));

export const remoteKeyFor = (hmacKey: Uint8Array, plaintextBlake3Hex: string): string =>
  bytesToHex(hmac(sha256, hmacKey, utf8ToBytes(plaintextBlake3Hex))).slice(0, 32);

// ---- passphrase wrap (argon2id) ---------------------------------------------
// Layout: [version=1][t 1][m KiB u32][salt 16][envelope]. Params live in the header (and in the
// envelope AAD) so a stronger default later still unwraps old blobs.
export interface KdfOpts { t?: number; m?: number } // m in KiB
const KDF = { t: 3, m: 64 * 1024 };
const kdf = (secret: string, salt: Uint8Array, o: { t: number; m: number }) =>
  argon2id(utf8ToBytes(secret.normalize('NFKC')), salt, { t: o.t, m: o.m, p: 1, dkLen: 32 });

export function wrapKey(entropy: Uint8Array, passphrase: string, salt: Uint8Array = randomBytes(16), opts?: KdfOpts): Uint8Array {
  const o = { ...KDF, ...opts };
  const head = new Uint8Array(6);
  head[0] = VERSION;
  head[1] = o.t;
  new DataView(head.buffer).setUint32(2, o.m);
  return concatBytes(head, salt, seal(kdf(passphrase, salt, o), entropy, head));
}

export function unwrapKey(wrapped: Uint8Array, passphrase: string): Uint8Array {
  if (wrapped.length < 22 + OVERHEAD || wrapped[0] !== VERSION) throw new Error('bad wrapped key');
  const head = wrapped.slice(0, 6);
  const o = { t: head[1]!, m: new DataView(head.buffer).getUint32(2) };
  return open(kdf(passphrase, wrapped.subarray(6, 22), o), wrapped.subarray(22), head);
}

// ---- device linking ---------------------------------------------------------
// ponytail: code-based linking (the 6-digit code is the shared secret; wrapKey with argon2id at 64 MiB).
// Brute force = 10^6 argon2id runs (~1 s each) against a single link file the provider can only read
// while it exists (10-minute expiry, deleted on receipt). Upgrade path: @noble/curves X25519 — the new
// device publishes an ephemeral public key in the QR, the sender seals to the ECDH secret, and the
// code becomes just a file name.
export const LINK_TTL_MS = 10 * 60 * 1000;

export function linkOffer(): { code: string } {
  const n = new DataView(randomBytes(4).buffer).getUint32(0) % 1_000_000;
  return { code: String(n).padStart(6, '0') };
}
export const sealForPeer = (code: string, entropy: Uint8Array, opts?: KdfOpts): Uint8Array =>
  wrapKey(entropy, code, undefined, opts);
export const openFromPeer = (code: string, sealed: Uint8Array): Uint8Array => unwrapKey(sealed, code);

// ---- manifest ---------------------------------------------------------------
export interface Manifest {
  schemaVersion: number;
  devices: Record<string, { name: string; lastSeen: number; lastBatch: string | null; removed?: boolean }>;
  keyCheck: string;
}

export const keyCheck = (hmacKey: Uint8Array): string =>
  bytesToHex(hmac(sha256, hmacKey, utf8ToBytes('engram-key-check')));
export const verifyKeyCheck = (hmacKey: Uint8Array, check: string): boolean => keyCheck(hmacKey) === check;

export const encodeManifest = (dataKey: Uint8Array, manifest: Manifest): Uint8Array =>
  seal(dataKey, utf8ToBytes(JSON.stringify(manifest)), utf8ToBytes('manifest'));

export function decodeManifest(dataKey: Uint8Array, sealed: Uint8Array): Manifest {
  const m = JSON.parse(bytesToUtf8(open(dataKey, sealed, utf8ToBytes('manifest'))));
  if (typeof m?.schemaVersion !== 'number' || typeof m.devices !== 'object' || typeof m.keyCheck !== 'string')
    throw new Error('bad manifest');
  return m as Manifest;
}
