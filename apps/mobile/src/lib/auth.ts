import { AuthRequest, CodeChallengeMethod, ResponseType, exchangeCodeAsync, makeRedirectUri, refreshAsync } from 'expo-auth-session';
import type { KeyStore } from '@engram/core';
import { getSettings } from './settings';

// Google OAuth (PKCE, no client secret) for Drive appDataFolder. The client id comes from Settings > Advanced,
// else the build-time EXPO_PUBLIC_GOOGLE_CLIENT_ID. Google's iOS/Android client types accept the app's custom
// scheme as redirect, so one 'engram:/oauthredirect' serves both.
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const KEY = 'google';

type Tokens = { access: string; refresh?: string; exp: number };

export const googleClientId = (): string =>
  getSettings().advanced.googleClientId || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

const read = async (keys: KeyStore): Promise<Tokens | null> => { const s = await keys.get(KEY); return s ? (JSON.parse(s) as Tokens) : null; };
const store = (keys: KeyStore, t: Tokens) => keys.set(KEY, JSON.stringify(t));
const fromResponse = (r: { accessToken: string; refreshToken?: string; expiresIn?: number }, prev?: Tokens | null): Tokens =>
  ({ access: r.accessToken, refresh: r.refreshToken ?? prev?.refresh, exp: Date.now() + (r.expiresIn ?? 3600) * 1000 });

export const isGoogleSignedIn = async (keys: KeyStore) => !!(await read(keys))?.refresh;

// Opens the browser; resolves once tokens are stored. Throws on cancel or a missing client id.
export async function signInGoogle(keys: KeyStore): Promise<void> {
  const clientId = googleClientId();
  if (!clientId) throw new Error('No Google client id. Set one in Settings > Advanced.');
  const redirectUri = makeRedirectUri({ scheme: 'engram', path: 'oauthredirect' });
  const req = new AuthRequest({
    clientId, redirectUri, scopes: [GOOGLE_SCOPE], responseType: ResponseType.Code, usePKCE: true,
    codeChallengeMethod: CodeChallengeMethod.S256, extraParams: { access_type: 'offline', prompt: 'consent' },
  });
  const res = await req.promptAsync(discovery);
  if (res.type !== 'success') throw new Error(res.type === 'error' ? res.error?.message ?? 'Sign-in failed' : 'Sign-in cancelled');
  const tokens = await exchangeCodeAsync({ clientId, code: res.params.code!, redirectUri, extraParams: { code_verifier: req.codeVerifier ?? '' } }, discovery);
  await store(keys, fromResponse(tokens));
}

export const signOutGoogle = (keys: KeyStore) => keys.delete(KEY);

// The token getter core's gdrive adapter wants: refreshes a minute before expiry.
export async function googleAccessToken(keys: KeyStore): Promise<string> {
  const t = await read(keys);
  if (!t) throw new Error('Not signed in to Google');
  if (Date.now() < t.exp - 60_000) return t.access;
  if (!t.refresh) throw new Error('Google session expired. Sign in again.');
  const r = await refreshAsync({ clientId: googleClientId(), refreshToken: t.refresh }, discovery);
  const next = fromResponse(r, t);
  await store(keys, next);
  return next.access;
}
