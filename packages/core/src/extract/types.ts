import type { Item, FileRole } from '../model/types';
import type { Platform } from '../platform';

export interface PendingFile {
  role: FileRole;
  bytes?: Uint8Array;
  url?: string;
  mime?: string;
}

export interface Enricher {
  id: string;
  match(url: URL, contentType?: string): number; // 0 = no, higher = priority
  enrich(ctx: { url: URL; html?: string; platform: Platform }): Promise<Partial<Item> & { files?: PendingFile[] }>;
}
