import { encode } from 'blurhash';

export function encodeBlurhash(rgba: Uint8Array, w: number, h: number, cx = 4, cy = 3): string {
  return encode(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), w, h, cx, cy);
}
