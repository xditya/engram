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
export const requestPermissions = (): Promise<boolean> =>
  native ? native.requestPermissions().then((r) => r.granted) : Promise.resolve(false);
