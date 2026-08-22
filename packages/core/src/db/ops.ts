import type { Op } from '../sync/types';

// Ops travel as JSON UTF-8. Binary cell values (embedding) are wrapped as {"$b64": "..."}.
const enc = new TextEncoder();
const dec = new TextDecoder();
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[n >> 18]! + B64[(n >> 12) & 63]! + (i + 1 < b.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < b.length ? B64[n & 63]! : '=');
  }
  return s;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0, acc = 0, j = 0;
  for (const ch of clean) {
    acc = (acc << 6) | B64.indexOf(ch); bits += 6;
    if (bits >= 8) { bits -= 8; out[j++] = (acc >> bits) & 255; }
  }
  return out;
}

// Cell value <-> JSON text (what ops.value and the wire carry).
export function encodeValue(v: unknown): string {
  return JSON.stringify(v instanceof Uint8Array ? { $b64: toBase64(v) } : v ?? null);
}
export function decodeValue(json: string): unknown {
  const v = JSON.parse(json);
  return v && typeof v === 'object' && typeof v.$b64 === 'string' ? fromBase64(v.$b64) : v;
}

type Wire = Omit<Op, 'value'> & { value: string };
const toWire = (op: Op): Wire => ({ ...op, value: encodeValue(op.value) });
const fromWire = (w: Wire): Op => ({ ...w, value: decodeValue(w.value) });

export const encodeOp = (op: Op): Uint8Array => enc.encode(JSON.stringify(toWire(op)));
export const decodeOp = (bytes: Uint8Array): Op => fromWire(JSON.parse(dec.decode(bytes)));
export const encodeOps = (ops: Op[]): Uint8Array => enc.encode(JSON.stringify(ops.map(toWire)));
export const decodeOps = (bytes: Uint8Array): Op[] => (JSON.parse(dec.decode(bytes)) as Wire[]).map(fromWire);
