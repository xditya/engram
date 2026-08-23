import { requireOptionalNativeModule } from 'expo';

export type ShareDiagnostics = Record<string, unknown>;
type Native = { shareDiagnostics(): ShareDiagnostics };

// null on Android / web: the share path there does not use an App Group.
const native = requireOptionalNativeModule<Native>('EngramDiag');

export const shareDiagnostics = (): ShareDiagnostics | null => native?.shareDiagnostics() ?? null;
