// Pure pixel math over RGBA buffers; decoding is the platform's job.
type Rgb = [number, number, number];

const DOWNSAMPLE_PX = 64;

export function dominantColors(rgba: Uint8Array, w: number, h: number, n = 5): string[] {
  const step = Math.max(1, Math.ceil(Math.max(w, h) / DOWNSAMPLE_PX));
  const px: Rgb[] = [];
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if ((rgba[i + 3] ?? 255) < 128) continue; // skip transparent
      px.push([rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]);
    }
  if (!px.length) return [];

  // Median cut: split the box with the widest channel range, largest box first.
  const boxes: Rgb[][] = [px];
  while (boxes.length < n) {
    boxes.sort((a, b) => b.length - a.length);
    const box = boxes[0]!;
    if (box.length < 2) break;
    const ch = widestChannel(box);
    if (range(box, ch) === 0) break; // largest box is uniform -> fewer than n colors
    box.sort((a, b) => a[ch] - b[ch]);
    const mid = box.length >> 1;
    boxes.splice(0, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map(avg).map(toHex);
}

function range(box: Rgb[], ch: 0 | 1 | 2): number {
  let lo = 255, hi = 0;
  for (const p of box) { if (p[ch] < lo) lo = p[ch]; if (p[ch] > hi) hi = p[ch]; }
  return hi - lo;
}
function widestChannel(box: Rgb[]): 0 | 1 | 2 {
  const r = [range(box, 0), range(box, 1), range(box, 2)];
  return r.indexOf(Math.max(...r)) as 0 | 1 | 2;
}
function avg(box: Rgb[]): Rgb {
  const s: Rgb = [0, 0, 0];
  for (const p of box) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
  return [Math.round(s[0] / box.length), Math.round(s[1] / box.length), Math.round(s[2] / box.length)];
}
function toHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex: string): Rgb {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export type NamedColor = 'black' | 'white' | 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'brown';

// ponytail: HSL threshold buckets tuned by eye; swap for Lab nearest-neighbour if tags look wrong.
export function nearestNamedColor(hex: string): NamedColor {
  const [r, g, b] = fromHex(hex).map((c) => c / 255) as Rgb;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l < 0.12) return 'black';
  if (l > 0.92 && s < 0.2) return 'white';
  if (s < 0.12) return 'gray';
  let hue = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue >= 15 && hue < 50 && l < 0.4) return 'brown';
  if (hue < 15 || hue >= 340) return l > 0.7 && s < 0.8 ? 'pink' : 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 160) return 'green';
  if (hue < 195) return 'teal';
  if (hue < 260) return 'blue';
  if (hue < 300) return 'purple';
  return 'pink';
}

export function colorTags(hexes: string[]): string[] {
  return [...new Set(hexes.map(nearestNamedColor))];
}
