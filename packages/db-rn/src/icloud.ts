import type { StorageAdapter } from '@engram/core';
import { File, Paths } from 'expo-file-system';
import { CloudStorage, CloudStorageProvider, CloudStorageScope } from 'react-native-cloud-storage';

// iCloud Drive (ubiquity container, app-data scope) as a dumb blob store. Binary blobs travel via temp files
// because the library's readFile/writeFile are string-only.
export function createICloudAdapter(): StorageAdapter {
  const cloud = new CloudStorage(CloudStorageProvider.ICloud, { scope: CloudStorageScope.AppData });
  const MANIFEST = 'manifest.enc';
  const tmp = () => new File(Paths.cache, `icloud-${Math.random().toString(36).slice(2)}.bin`);
  const dirsMade = new Set<string>();

  async function mkdirs(key: string) {
    const parts = key.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (dirsMade.has(dir)) continue;
      if (!(await cloud.exists(dir))) await cloud.mkdir(dir);
      dirsMade.add(dir);
    }
  }
  async function put(key: string, bytes: Uint8Array) {
    await mkdirs(key);
    const f = tmp();
    f.write(bytes);
    try { await cloud.uploadFile(key, f.uri, { mimeType: 'application/octet-stream' }); } finally { f.delete(); }
  }
  // Ubiquitous items may be evicted locally; downloadFile(path) forces a fetch and resolves once it is present.
  async function get(key: string): Promise<Uint8Array | null> {
    if (!(await cloud.exists(key))) return null;
    await cloud.downloadFile(key);
    const f = tmp();
    try {
      await cloud.downloadFile(key, f.uri);
      return await f.bytes();
    } finally { if (f.exists) f.delete(); }
  }
  const mtime = async (key: string) => String((await cloud.stat(key)).mtimeMs);

  return {
    // ponytail: exists-then-upload is not atomic; two devices racing on one key both "create". Keys are
    // per-device (ops/<dev>/) or content-addressed (same bytes), so the loser overwrites with identical content.
    // Only link/<code> could collide: a random 6-digit code inside a 10-minute window.
    async putIfAbsent(key, bytes) {
      if (await cloud.exists(key)) return 'exists';
      await put(key, bytes);
      return 'created';
    },
    get,
    // readdir is one level; the engine asks for 'ops/<dev>/', 'blobs/', 'inbox/', 'snapshots/' or 'ops/', so one
    // extra level is walked. iCloud lists lag, which the engine tolerates (batches name their predecessor).
    async list(prefix) {
      const dir = prefix.replace(/\/$/, '');
      if (!(await cloud.exists(dir))) return { keys: [] };
      const keys: string[] = [];
      for (const name of await cloud.readdir(dir)) {
        const key = `${dir}/${name}`;
        if ((await cloud.stat(key)).isDirectory()) for (const sub of await cloud.readdir(key)) keys.push(`${key}/${sub}`);
        else keys.push(key);
      }
      return { keys };
    },
    async delete(key) { if (await cloud.exists(key)) await cloud.unlink(key); },
    // No ETag on iCloud: mtime is the version. ifMatch is advisory by contract (manifest is rebuildable from ops/).
    async putManifest(bytes, ifMatch) {
      if (ifMatch && (await cloud.exists(MANIFEST)) && (await mtime(MANIFEST)) !== ifMatch) return 'conflict';
      const f = tmp();
      f.write(bytes);
      try { await cloud.uploadFile(MANIFEST, f.uri, { mimeType: 'application/octet-stream' }); } finally { f.delete(); }
      return { etag: await mtime(MANIFEST) };
    },
    async deleteManifest() { if (await cloud.exists(MANIFEST)) await cloud.unlink(MANIFEST); },
    async getManifest() {
      const bytes = await get(MANIFEST);
      return bytes ? { bytes, etag: await mtime(MANIFEST) } : null;
    },
  };
}
