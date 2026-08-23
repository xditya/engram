// Hermes has no WebCrypto. uuid v7 and @noble's randomBytes both call
// crypto.getRandomValues, so back it with the native RNG before anything else loads.
import { getRandomValues } from 'expo-crypto';

const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (typeof g.crypto?.getRandomValues !== 'function') {
  g.crypto = Object.assign(g.crypto ?? {}, { getRandomValues });
}
