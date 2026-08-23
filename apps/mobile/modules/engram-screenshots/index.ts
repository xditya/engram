import { requireOptionalNativeModule } from 'expo';

type Native = {
  isRunning(): boolean;
  start(): void;
  stop(): void;
  requestPermissions(): Promise<{ granted: boolean }>;
};

// Android only. null on iOS (no background screenshot detection exists there), web and Expo Go.
const native = requireOptionalNativeModule<Native>('EngramScreenshots');

export const isSupported = (): boolean => !!native;
export const isRunning = (): boolean => !!native?.isRunning();
export const start = (): void => native?.start();
export const stop = (): void => native?.stop();
// Asked from JS: RN's PermissionsAndroid shows the system dialogs reliably; the module's own request did not.
export async function requestPermissions(): Promise<boolean> {
  if (!native) return false;
  const { PermissionsAndroid, Platform } = require('react-native') as typeof import('react-native');
  const api = Number(Platform.Version);
  const wanted = api >= 33
    ? [PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES, PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS]
    : [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];
  const res = await PermissionsAndroid.requestMultiple(wanted);
  // Trust the system's current state over the dialog result: some OEM dialogs report 'denied' for an existing grant.
  const missing: (typeof wanted)[number][] = [];
  for (const p of wanted) if (!(await PermissionsAndroid.check(p))) missing.push(p);
  if (!missing.length) return true;
  // Android 14+ "Select photos": partial access cannot see new screenshots, so the watcher needs "Allow all".
  if (api >= 34 && missing.includes(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES)
    && (await PermissionsAndroid.check('android.permission.READ_MEDIA_VISUAL_USER_SELECTED' as never))) throw new Error('partial');
  if (missing.some((p) => res[p] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) throw new Error('blocked');
  throw new Error(`missing:${missing.map((p) => p.split('.').pop()).join(', ')}`);
}
