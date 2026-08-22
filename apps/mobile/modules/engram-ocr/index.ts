import { requireOptionalNativeModule } from 'expo';

type Native = { isAvailable(): boolean; recognizeText(uri: string): Promise<string> };

// null on web, in Expo Go, or in an F-Droid build whose Kotlin side reports no engine.
const native = requireOptionalNativeModule<Native>('EngramOcr');

export const isAvailable = (): boolean => !!native?.isAvailable();

export function recognizeText(uri: string): Promise<string> {
  if (!native) return Promise.reject(new Error('EngramOcr: native module not linked'));
  return native.recognizeText(uri);
}
