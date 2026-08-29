import { describe, expect, it } from 'vitest';
import { createMemoryAdapter, createSharedStore } from '../src/storage/memory';
import { wipeRemote } from '../src/sync/wipe';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('wipeRemote', () => {
  it('removes every key sync wrote, the manifest included, over several pages', async () => {
    const store = createSharedStore();
    const s = createMemoryAdapter(store, { pageSize: 2 });
    for (const k of ['ops/dev1/000001-a.bin', 'ops/dev1/000002-b.bin', 'ops/dev2/000001-c.bin',
                     'snapshots/dev1/000003.bin', 'inbox/x.enc', 'blobs/aa/bb.enc', 'link/123456.enc']) {
      await s.putIfAbsent(k, bytes(k));
    }
    await s.putManifest(bytes('{}'), null);

    expect(await wipeRemote(s)).toBe(7);
    expect(await s.getManifest()).toBeNull();
    for (const prefix of ['ops/', 'snapshots/', 'inbox/', 'blobs/', 'link/']) {
      expect((await s.list(prefix)).keys).toEqual([]);
    }
  });

  it('is fine on a store that is already empty', async () => {
    const s = createMemoryAdapter();
    expect(await wipeRemote(s)).toBe(0);
  });
});
