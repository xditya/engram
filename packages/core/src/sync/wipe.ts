import type { StorageAdapter } from '../storage/types';

// Everything the sync engine writes lives under one of these, plus the manifest at the root.
const PREFIXES = ['ops/', 'snapshots/', 'inbox/', 'blobs/', 'link/'];

// Empties the store the way someone means it when they say "delete my data from Drive": every key sync wrote,
// then the manifest last, so a wipe that dies halfway still looks like a store to the next device rather than
// like an empty one it should adopt. Keys are collected before deleting, since a page token does not survive
// the page being deleted underneath it. Returns how many keys went.
export async function wipeRemote(storage: StorageAdapter): Promise<number> {
  const keys: string[] = [];
  for (const prefix of PREFIXES) {
    for (let after: string | undefined; ;) {
      const page = await storage.list(prefix, after);
      for (const key of page.keys) if (!key.endsWith('/')) keys.push(key);
      if (!page.next) break;
      after = page.next;
    }
  }
  for (const key of keys) await storage.delete(key);
  // A store with no manifest is a store nobody has set up yet, which is what the user asked for.
  await storage.deleteManifest();
  return keys.length;
}
