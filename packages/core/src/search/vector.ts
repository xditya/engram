export function decodeVec(bytes: Uint8Array): Float32Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(bytes.byteLength >> 2);
  for (let i = 0; i < out.length; i++) out[i] = dv.getFloat32(i * 4, true);
  return out;
}

export function encodeVec(vec: Float32Array): Uint8Array {
  const out = new Uint8Array(vec.length * 4);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < vec.length; i++) dv.setFloat32(i * 4, vec[i]!, true);
  return out;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// ponytail: brute force O(n*dim) per query; vec0/HNSW only past ~100k cards.
export function cosineTopK(
  query: Float32Array, model: string,
  rows: { id: string; vec: Uint8Array; model: string | null }[], k: number,
): { id: string; score: number }[] {
  const scored: { id: string; score: number }[] = [];
  for (const r of rows) {
    if (r.model !== model || r.vec.byteLength !== query.length * 4) continue;
    scored.push({ id: r.id, score: cosine(query, decodeVec(r.vec)) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}
