export const THUMB_MAX_PX = 800;
export const THUMB_JPEG_QUALITY = 80;
// Originals at or below this size ride along on cellular; larger ones wait for Wi-Fi unless pinned.
export const CELLULAR_ORIGINAL_MAX_BYTES = 2 * 1024 * 1024;

export function shouldSyncOriginal(o: { bytes: number; onWifi: boolean; keepOffline: boolean }): boolean {
  return o.keepOffline || o.onWifi || o.bytes <= CELLULAR_ORIGINAL_MAX_BYTES;
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  avif: 'image/avif', heif: 'image/heif', heic: 'image/heic', bmp: 'image/bmp', tiff: 'image/tiff', tif: 'image/tiff',
  svg: 'image/svg+xml', md: 'text/markdown', pdf: 'application/pdf',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
};
// Reversed so the first extension listed for a mime wins (jpg over jpeg, tiff over tif).
const EXT: Record<string, string> = Object.fromEntries(Object.entries(MIME).reverse().map(([e, m]) => [m, e]));

export function mimeFromExtension(extOrName: string): string | undefined {
  return MIME[extOrName.replace(/^.*\./, '').toLowerCase()];
}
export function extensionFromMime(mime: string): string | undefined {
  return EXT[mime.split(';')[0]!.trim().toLowerCase()];
}
