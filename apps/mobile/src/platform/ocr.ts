import { Platform as RN } from 'react-native';
import { isAvailable, recognizeText } from '../../modules/engram-ocr';

// undefined -> core skips ocr jobs and the settings screen says "Text recognition isn't available on this device".
export const ocr: ((path: string) => Promise<string>) | undefined =
  RN.OS !== 'web' && isAvailable() ? recognizeText : undefined;
