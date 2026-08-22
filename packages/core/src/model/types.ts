export type ItemType =
  | 'note' | 'link' | 'article' | 'image' | 'video' | 'pdf' | 'quote'
  | 'product' | 'book' | 'recipe' | 'tweet' | 'repo' | 'file';

// Row shapes mirror schema.sql column-for-column. Timestamps are epoch ms.
export interface Item {
  id: string;
  type: ItemType;
  url: string | null;
  domain: string | null;
  title: string | null;
  body: string | null;
  summary: string | null;
  ocr_text: string | null;
  meta: string | null; // JSON, per-type scalars
  colors: string | null; // JSON ["#1a2b3c", ...]
  embedding: Uint8Array | null; // Float32 little-endian
  embedding_dim: number | null;
  embedding_model: string | null;
  pinned_at: number | null;
  opened_at: number | null;
  open_count: number;
  resurfaced_at: number | null;
  let_go_at: number | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
  created_by: string;
}

export type FileRole = 'original' | 'thumb' | 'reader_html' | 'poster';

export interface FileRow {
  hash: string;
  item_id: string;
  role: FileRole;
  mime: string | null;
  bytes: number | null;
  w: number | null;
  h: number | null;
  blurhash: string | null;
  deleted_at: number | null;
}

export interface Tag {
  item_id: string;
  tag: string;
  source: 'user' | 'ai' | 'import';
  deleted_at: number | null;
}

export interface Space {
  id: string;
  name: string;
  query: string | null;
  sort: number | null;
  deleted_at: number | null;
}

export interface SpaceItem {
  space_id: string;
  item_id: string;
  added_at: number | null;
  deleted_at: number | null;
}

export type JobKind = 'extract' | 'colors' | 'ocr' | 'classify' | 'embed' | 'describe_image' | 'thumb';
export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface Job {
  id: string;
  item_id: string | null;
  kind: JobKind;
  status: JobStatus;
  attempts: number;
  error: string | null;
  run_after: number | null;
  created_at: number;
}

export interface IntelligenceSettings {
  mode: 'on-device' | 'key' | 'off';
  provider?: 'anthropic' | 'gemini' | 'openai' | 'openrouter' | 'ollama' | 'lmstudio' | 'groq' | 'mistral' | 'custom';
  baseUrl?: string; // openaiCompatible only
  chatModel?: string;
  embedModel?: string;
  visionModel?: string;
  embedProvider?: 'same' | 'on-device';
  summaries: boolean; // default true for key, false for on-device
  describeImages: boolean; // default false
  monthlyBudgetUsd?: number; // soft cap
}
