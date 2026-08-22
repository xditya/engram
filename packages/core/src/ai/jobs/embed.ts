import type { Item } from '../../model/types';
import type { Provider } from '../types';

export interface EmbedPatch { embedding: Uint8Array; embedding_dim: number; embedding_model: string }

export function embedText(item: Item, tags: string[] = []): string {
  return [item.title, item.summary || item.body?.slice(0, 2000), item.ocr_text, tags.join(', ')].filter(Boolean).join('\n');
}

// ponytail: Float32Array is host-endian; every target we ship to is little-endian. DataView loop if that changes.
export const vecToBlob = (v: Float32Array): Uint8Array => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
export const blobToVec = (b: Uint8Array): Float32Array => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

export async function embed(provider: Provider, item: Item, opts: { tags?: string[] } = {}): Promise<EmbedPatch> {
  if (!provider.embed) throw new Error(`${provider.id} has no embeddings`);
  const text = embedText(item, opts.tags);
  if (!text) throw new Error('nothing to embed');
  const { vectors, model, dim } = await provider.embed([text]);
  const v = vectors[0];
  if (!v) throw new Error('empty embedding response');
  return { embedding: vecToBlob(v), embedding_dim: dim, embedding_model: model };
}
