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
  if (wanted.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED)) return true;
  // Denied with "don't ask again": Android will not show the dialog anymore; only the app's settings page can grant it.
  if (wanted.some((p) => res[p] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) throw new Error('blocked');
  return false;
}
