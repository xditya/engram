import { requireOptionalNativeModule } from 'expo';

export type ShareDiagnostics = Record<string, unknown>;
type Native = { shareDiagnostics(): ShareDiagnostics; takeSharedPasteboard(): string[] };

// null on Android / web: the share path there does not use an App Group.
const native = requireOptionalNativeModule<Native>('EngramDiag');

export const shareDiagnostics = (): ShareDiagnostics | null => native?.shareDiagnostics() ?? null;

// file:// URIs of media the share extension parked on the named pasteboard (no App Group). Empty elsewhere.
export const takeSharedPasteboard = (): string[] => native?.takeSharedPasteboard() ?? [];
