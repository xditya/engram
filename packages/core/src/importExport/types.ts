import type { FileRow, Item, ItemType, Space, SpaceItem, Tag } from '../model/types';

export interface ImportedCard {
  type: ItemType;
  title?: string;
  url?: string;
  body?: string;
  tags: string[];
  createdAt?: number; // epoch ms
  fileRef?: string; // file name inside the import; the caller maps it to bytes
  sourceId?: string; // id in the source system (a quote card's sourceId points at its parent)
}

export interface ImportResult {
  cards: ImportedCard[];
  unmatchedFiles: string[];
  warnings: string[];
}

export interface ExportData {
  items: Item[];
  tags: Tag[];
  spaces?: Space[];
  spaceItems?: SpaceItem[];
  files?: FileRow[];
}

export interface ExportFile {
  path: string;
  content: string | Uint8Array;
}

export type ImportFormat = 'engram' | 'mymind' | 'raindrop' | 'pocket' | 'netscape' | 'obsidian';
