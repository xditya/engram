// Incoming links are handled by the root layout (save) or carried to the link screen (link); neither has a
// route of its own, so without this expo-router would flash its Unmatched Route screen.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const code = /[?&]code=(\d{6})/.exec(path)?.[1];
  if (code) return `/sync/link?code=${code}`;
  if (/(^|\/)save(\?|$)/.test(path)) return '/';
  return path;
}
