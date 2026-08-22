import { Platform as RN } from 'react-native';
import { File } from 'expo-file-system';
import {
  ai, crypto, extract, media, type EngramDb, type FileRole, type JobKind, type OnDeviceAI, type Platform, type Queue,
} from '@engram/core';
import { readRgba } from '@engram/db-rn';
import { getSettings, useSettings } from './settings';
import type { Secrets } from './secrets';

export type JobCtx = { platform: Platform; db: EngramDb; secrets: Secrets; onDevice?: OnDeviceAI };

const MAX_DOWNLOAD = 20 * 1024 * 1024;

// Hash, store, and register one file for an item. Returns the hash. Same bytes twice = one row, one file.
export async function addFile(
  ctx: Pick<JobCtx, 'platform' | 'db'>, itemId: string, role: FileRole, bytes: Uint8Array, mime: string | null,
  dims: { w?: number | null; h?: number | null } = {},
): Promise<string> {
  const hash = crypto.blake3Hex(bytes);
  await ctx.platform.files.write(hash, bytes);
  ctx.db.files.add({ hash, item_id: itemId, role, mime, bytes: bytes.length, w: dims.w ?? null, h: dims.h ?? null, blurhash: null });
  return hash;
}

async function download(url: string): Promise<{ bytes: Uint8Array; mime: string | null }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_DOWNLOAD) throw new Error('download too large');
  return { bytes: new Uint8Array(buf), mime: res.headers.get('content-type')?.split(';')[0] ?? null };
}

export function createJobs(ctx: JobCtx): Queue {
  const { platform, db, secrets } = ctx;
  const provider = () => ai.createProvider(getSettings().intelligence, { apiKey: secrets.get('apiKey') ?? undefined }, { fetch, onDevice: ctx.onDevice });
  const month = () => new Date().toISOString().slice(0, 7);

  const handlers: Partial<Record<JobKind, (itemId: string) => Promise<void>>> = {
    // Enrich a link from its page (the shared reader_html if the share sheet captured one, else a fetch).
    async extract(itemId) {
      const item = db.items.get(itemId);
      if (!item?.url) return;
      const reader = db.files.of(itemId).find((f) => f.role === 'reader_html');
      const html = reader ? new TextDecoder().decode(await platform.files.read(reader.hash)) : undefined;
      const { files: pending = [], ...patch } = await extract.runEnrichers(item.url, { html, platform });
      if (item.body) delete patch.body; // a note or quote the user typed wins over page text
      if (Object.keys(patch).length) db.items.update(itemId, patch);
      for (const pf of pending) {
        try {
          const got = pf.bytes ? { bytes: pf.bytes, mime: pf.mime ?? null } : await download(pf.url!);
          await addFile(ctx, itemId, pf.role, got.bytes, pf.mime ?? got.mime);
        } catch { /* a missing og:image never fails the extract */ }
      }
      const kinds: JobKind[] = ['classify', 'embed'];
      if (db.files.of(itemId).some((f) => f.role === 'thumb' || f.role === 'original' || f.role === 'poster')) kinds.unshift('thumb');
      queue.enqueueFor(itemId, kinds);
    },
    // 800 px JPEG from the original (image), a poster frame (video) or the enricher's full-size image.
    async thumb(itemId) {
      const rows = db.files.of(itemId);
      if (rows.some((f) => f.role === 'thumb' && f.w)) return;
      const src = rows.find((f) => f.role === 'original' && f.mime?.startsWith('image/'))
        ?? rows.find((f) => f.role === 'thumb') ?? rows.find((f) => f.role === 'poster');
      const video = rows.find((f) => f.role === 'original' && f.mime?.startsWith('video/'));
      let srcPath = src ? platform.files.path(src.hash) : undefined;
      let temp: string | undefined;
      if (!srcPath && video && RN.OS !== 'web') {
        const { getThumbnailAsync } = require('expo-video-thumbnails') as typeof import('expo-video-thumbnails');
        srcPath = temp = (await getThumbnailAsync(platform.files.path(video.hash), { time: 1000 })).uri;
      }
      if (!srcPath) return;
      const t = await platform.thumbnail(srcPath, media.THUMB_MAX_PX);
      const hash = await addFile(ctx, itemId, 'thumb', await new File(t.path).bytes(), 'image/jpeg', { w: t.w, h: t.h });
      if (src?.role === 'thumb' && src.hash !== hash) { db.files.remove(src.hash); await platform.files.remove(src.hash); }
      for (const p of [t.path, temp]) if (p) { try { new File(p).delete(); } catch { /* cache */ } }
      queue.enqueueFor(itemId, ['colors']);
    },
    // Palette + blurhash. readRgba is a no-op on native until an RGBA Expo Module exists, so this finishes early.
    async colors(itemId) {
      const thumb = db.files.of(itemId).find((f) => f.role === 'thumb');
      if (!thumb) return;
      const px = await readRgba(platform.files.path(thumb.hash), 64);
      if (!px) return;
      db.items.update(itemId, { colors: JSON.stringify(media.dominantColors(px.rgba, px.w, px.h)) });
      db.files.add({ ...thumb, blurhash: media.encodeBlurhash(px.rgba, px.w, px.h) });
    },
  };

  const queue: Queue = ai.createQueue({
    db: platform.db,
    now: platform.now,
    provider,
    embedder: () => ai.createEmbedder(getSettings().intelligence, provider(), { onDevice: ctx.onDevice }),
    settings: () => getSettings().intelligence,
    platform: { ocr: platform.ocr, files: platform.files },
    writer: {
      update: (id, patch) => db.items.update(id, patch),
      addTags: (id, tags, source) => { for (const t of tags) db.tags.add(id, t, source); },
      getItem: (id) => db.items.get(id) ?? null,
      filesOf: (id) => db.files.of(id),
    },
    handlers,
    spent: () => { const s = getSettings().spend; return s.month === month() ? s.usd : 0; },
    onSpend: (usd) => {
      const s = getSettings().spend;
      useSettings.getState().patch('spend', s.month === month() ? { usd: s.usd + usd } : { month: month(), usd });
    },
  });
  return queue;
}
