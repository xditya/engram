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
  return wanted.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED);
}
