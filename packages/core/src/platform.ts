// Everything core does is a function of this interface. Clients (mobile, web, extension) implement it;
// core itself never imports a driver, file API, fetch polyfill or ML library.

export interface Database {
  // Synchronous on purpose: op-sqlite (JSI) and better-sqlite3 are both sync.
  exec(sql: string, params?: unknown[]): void;
  query<T>(sql: string, params?: unknown[]): T[];
  transaction<T>(fn: () => T): T;
}

export interface KeyStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

// Content-addressed: key = plaintext BLAKE3 hex of the bytes.
export interface FileStore {
  write(hash: string, bytes: Uint8Array): Promise<void>;
  read(hash: string): Promise<Uint8Array>;
  remove(hash: string): Promise<void>;
  path(hash: string): string;
}

export interface OnDeviceAI {
  complete(req: { system: string; user: string; json?: boolean; maxTokens: number }): Promise<string>;
  embed(texts: string[]): Promise<Float32Array[]>;
  ready(): Promise<boolean>;
  loaded?: boolean; // set once ready() succeeded; until then complete/embed would start a model download
}

export interface Platform {
  db: Database;
  keys: KeyStore;
  files: FileStore;
  fetchText(url: string, opts?: { maxBytes?: number; userAgent?: string }): Promise<{ html: string; finalUrl: string; contentType: string }>;
  thumbnail(path: string, maxPx: number): Promise<{ path: string; w: number; h: number }>;
  ocr?(path: string): Promise<string>; // undefined: ocr jobs are skipped on this device
  onDevice?: OnDeviceAI; // undefined: on-device provider not offered
  net: { onChange(cb: (online: boolean) => void): () => void };
  now(): number; // injectable for tests and the HLC
  deviceId: string;
}
