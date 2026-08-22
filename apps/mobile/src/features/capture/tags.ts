// "read later #design #ux" -> { note: 'read later', tags: ['design', 'ux'] }
export function splitTags(s: string): { note?: string; tags: string[] } {
  const tags = [...s.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1]!.toLowerCase());
  const note = s.replace(/#[\p{L}\p{N}_-]+/gu, '').replace(/\s+/g, ' ').trim();
  return { note: note || undefined, tags: [...new Set(tags)] };
}
