import type { Item } from '@engram/core';
import type { Engram, ShareIntentLike } from '../../lib/engram';

// Share sheet / share intent → capture API. Android "Title\nhttps://…" text and iOS webUrl + meta.title are both
// handled inside capture.fromShareIntent; this stays as the named entry point the share path documents.
export type SharedPayload = ShareIntentLike;
export const savePendingCapture = (e: Engram, s: SharedPayload): Promise<Item[]> => e.capture.fromShareIntent(s);
