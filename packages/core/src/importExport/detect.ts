import type { ImportFormat } from './types';

// Only the head of the file is needed; callers read a few KB, not the whole export.
export function detectFormat(filename: string, head: string): ImportFormat | null {
  const name = filename.toLowerCase();
  const h = head.replace(/^﻿/, '').trimStart();
  if (/NETSCAPE-Bookmark-file|<DT><A\s/i.test(h)) return 'netscape';
  if (name.endsWith('.md') || /^---\r?\n/.test(h)) return 'obsidian';
  if (name.endsWith('.json') || h.startsWith('{')) return /"engram"\s*:/.test(h) ? 'engram' : null;
  if (name.endsWith('.csv') || h.includes(',')) {
    const header = h.split(/\r?\n/)[0]!.toLowerCase();
    if (header.includes('time_added')) return 'pocket';
    if (header.includes('excerpt') && header.includes('folder')) return 'raindrop';
    return 'mymind';
  }
  return null;
}
