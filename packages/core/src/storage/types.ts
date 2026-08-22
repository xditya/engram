// A dumb blob store the user owns (iCloud, Google Drive appData, WebDAV, memory in tests).
export interface StorageAdapter {
  putIfAbsent(key: string, bytes: Uint8Array): Promise<'created' | 'exists'>;
  get(key: string): Promise<Uint8Array | null>;
  list(prefix: string, after?: string): Promise<{ keys: string[]; next?: string }>;
  delete(key: string): Promise<void>;
  // ifMatch is advisory: iCloud has no ETag and the manifest is always rebuildable from ops/.
  putManifest(bytes: Uint8Array, ifMatch: string | null): Promise<{ etag: string } | 'conflict'>;
  getManifest(): Promise<{ bytes: Uint8Array; etag: string } | null>;
}
