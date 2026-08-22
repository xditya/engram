import { describe, expect, it } from 'vitest';
import {
  colorTags, dominantColors, encodeBlurhash, extensionFromMime, mimeFromExtension, nearestNamedColor, shouldSyncOriginal,
} from '../src/media';

function image(w: number, h: number, fill: (x: number, y: number) => [number, number, number]): Uint8Array {
  const buf = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fill(x, y);
    buf.set([r, g, b, 255], (y * w + x) * 4);
  }
  return buf;
}

describe('palette', () => {
  it('solid image -> one color', () => {
    expect(dominantColors(image(200, 100, () => [255, 0, 0]), 200, 100)).toEqual(['#ff0000']);
  });
  it('two halves -> two colors, named', () => {
    const img = image(128, 64, (x) => (x < 64 ? [0, 0, 255] : [255, 255, 255]));
    const hexes = dominantColors(img, 128, 64);
    expect(hexes.sort()).toEqual(['#0000ff', '#ffffff']);
    expect(colorTags(hexes).sort()).toEqual(['blue', 'white']);
  });
  it('names colors', () => {
    const cases: [string, string][] = [
      ['#000000', 'black'], ['#ffffff', 'white'], ['#808080', 'gray'], ['#e02020', 'red'], ['#ff8800', 'orange'],
      ['#ffdd00', 'yellow'], ['#22aa33', 'green'], ['#20b2aa', 'teal'], ['#1e50d0', 'blue'], ['#8030c0', 'purple'],
      ['#ff69b4', 'pink'], ['#8b4513', 'brown'],
    ];
    for (const [hex, name] of cases) expect(nearestNamedColor(hex), hex).toBe(name);
  });
});

describe('blurhash', () => {
  it('encodes a 4x3 hash of the expected length', () => {
    const hash = encodeBlurhash(image(32, 32, (x) => [x * 8, 0, 255 - x * 8]), 32, 32);
    expect(hash).toHaveLength(6 + 2 * (4 * 3 - 1));
    expect(hash).toMatch(/^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]+$/);
  });
});

describe('policy', () => {
  it('sync rules', () => {
    expect(shouldSyncOriginal({ bytes: 50e6, onWifi: false, keepOffline: false })).toBe(false);
    expect(shouldSyncOriginal({ bytes: 50e6, onWifi: true, keepOffline: false })).toBe(true);
    expect(shouldSyncOriginal({ bytes: 50e6, onWifi: false, keepOffline: true })).toBe(true);
    expect(shouldSyncOriginal({ bytes: 1e6, onWifi: false, keepOffline: false })).toBe(true);
  });
  it('mime <-> extension', () => {
    expect(mimeFromExtension('photo.JPG')).toBe('image/jpeg');
    expect(mimeFromExtension('mov')).toBe('video/quicktime');
    expect(mimeFromExtension('exe')).toBeUndefined();
    expect(extensionFromMime('image/jpeg')).toBe('jpg');
    expect(extensionFromMime('text/markdown; charset=utf-8')).toBe('md');
    expect(extensionFromMime('image/tiff')).toBe('tiff');
  });
});
