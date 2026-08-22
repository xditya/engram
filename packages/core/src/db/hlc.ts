// HLC string: "wallms(13 digits)-counter(4 hex)-deviceId". Zero-padding makes plain string compare correct.
export interface Hlc {
  next(): string;
  observe(hlc: string): void;
}

export function parseHlc(s: string): { wall: number; counter: number; deviceId: string } {
  const wall = Number(s.slice(0, 13));
  const counter = parseInt(s.slice(14, 18), 16);
  return { wall, counter, deviceId: s.slice(19) };
}

export function compareHlc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const HOUR = 3_600_000;

// The clock never refuses a write: a wall clock behind what we have seen is clamped forward,
// a wall clock far ahead only triggers onSkew.
export function makeHlc(deviceId: string, now: () => number, onSkew?: (aheadMs: number) => void): Hlc {
  let wall = 0;
  let counter = 0;
  let maxSeenWall = 0;
  const fmt = () => `${String(wall).padStart(13, '0')}-${counter.toString(16).padStart(4, '0')}-${deviceId}`;
  return {
    next() {
      const local = now();
      if (maxSeenWall && local > maxSeenWall + HOUR) onSkew?.(local - maxSeenWall);
      const w = Math.max(local, wall, maxSeenWall);
      if (w === wall) counter++; else { wall = w; counter = 0; }
      // ponytail: 65535 ops in one ms overflows the 4 hex digits; bump the wall instead of widening the format
      if (counter > 0xffff) { wall++; counter = 0; }
      return fmt();
    },
    observe(hlc) {
      const { wall: w, counter: c } = parseHlc(hlc);
      if (w > maxSeenWall) maxSeenWall = w;
      if (w > wall || (w === wall && c > counter)) { wall = w; counter = c; }
    },
  };
}
