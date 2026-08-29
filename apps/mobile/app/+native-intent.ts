// Incoming links are handled by the root layout (save) or carried to the link screen (link); neither has a
// route of its own, so without this expo-router would flash its Unmatched Route screen.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  // Google hands the OAuth code back on the app's own scheme. expo-auth-session is already listening for it, so
  // expo-router has to ignore the link: routing it unmounts the screen waiting for the code, and lands on Unmatched Route.
  if (/oauthredirect/.test(path)) return '';
  const code = /[?&]code=(\d{6})/.exec(path)?.[1];
  if (code) return `/sync/link?code=${code}`;
  if (/(^|\/)save(\?|$)/.test(path)) return '/';
  if (/dataUrl=/.test(path)) return '/'; // expo-share-intent's hand-off; the root layout reads the payload itself
  return path;
}
