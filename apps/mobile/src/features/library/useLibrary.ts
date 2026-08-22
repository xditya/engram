import { useState } from 'react';
import { db as coreDb, type FileRow, type Item } from '@engram/core';
import { useLiveQuery, useSettings, type Engram } from '../../lib/engram';

export type Sort = 'saved' | 'opened' | 'type' | 'title';
export type Entry = { item: Item; thumb?: FileRow; uri?: string; strength: number };

const PAGE = 100;

function entry(e: Engram, item: Item, now: number): Entry {
  // ponytail: one files query per card; join in SQL if libraries pass ~5k items
  const rows = e.db.files.of(item.id);
  const thumb = rows.find((f) => f.role === 'thumb') ?? rows.find((f) => f.role === 'poster')
    ?? rows.find((f) => f.role === 'original' && f.mime?.startsWith('image/'));
  return { item, thumb, uri: thumb ? e.platform.files.path(thumb.hash) : undefined, strength: coreDb.traceStrength(item, now) };
}

export function useLibrary(sort: Sort) {
  const [limit, setLimit] = useState(PAGE);
  const entries = useLiveQuery((e) => {
    const now = e.platform.now();
    const list = e.db.items.list({ sort: sort === 'type' ? 'saved' : sort, limit });
    if (sort === 'type') list.sort((a, b) => a.type.localeCompare(b.type) || b.created_at - a.created_at);
    return list.map((i) => entry(e, i, now));
  }, [sort, limit]);
  const pinned = useLiveQuery((e) => e.db.items.list({ view: 'pinned', limit: 5 }).map((i) => entry(e, i, e.platform.now())), []);
  const count = useLiveQuery((e) => e.platform.db.query<{ n: number }>('SELECT COUNT(*) n FROM items WHERE deleted_at IS NULL')[0]?.n ?? 0, []);
  const more = () => { if (entries && entries.length >= limit) setLimit(limit + PAGE); };
  return { entries: entries ?? [], pinned: pinned ?? [], count: count ?? 0, more };
}

// Persisted through settings.ui.sort; 'type' is list-only and session-local.
export function useSortSetting(): [Sort, (s: Sort) => void] {
  const saved = useSettings((s) => s.ui.sort);
  const patch = useSettings((s) => s.patch);
  const [local, setLocal] = useState<Sort | null>(null);
  const sort: Sort = local ?? (saved === 'modified' ? 'saved' : saved);
  return [sort, (s) => { setLocal(s); if (s !== 'type') patch('ui', { sort: s }); }];
}
