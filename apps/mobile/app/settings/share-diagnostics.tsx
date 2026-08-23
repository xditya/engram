import { useState } from 'react';
import { Platform as RN, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { shareDiagnostics } from '../../modules/engram-diag';
import { Group, Page } from '../../src/features/settings/ui';
import { useShareLog } from '../../src/lib/shareLog';
import { useToast } from '../../src/lib/engram';
import { useTheme } from '../../src/theme/useTheme';
import { Button, Text } from '../../src/ui';

// Everything the share path depends on, as this install sees it. Copy it into a bug report.
export default function ShareDiagnostics() {
  const { space } = useTheme();
  const show = useToast((s) => s.show);
  const entries = useShareLog((s) => s.entries);
  const [diag] = useState(() => (RN.OS === 'ios' ? shareDiagnostics() : null));
  const lines = diag ? Object.entries(diag).map(([k, v]) => `${k}: ${Array.isArray(v) ? (v.length ? v.join(', ') : '(none)') : String(v)}`) : [];
  const verdict = !diag ? null
    : !(diag.pluginsFound as string[])?.length ? 'The share extension is not in this install. The IPA was built without it, or the sideloading tool removed it.'
    : !diag.resolvedGroup ? 'No App Group id. The extension cannot hand anything to the app.'
    : diag.containerAccessible === false || diag.userDefaultsRoundTrip === false ? `The app is not entitled for group "${diag.resolvedGroup}". With a free Apple ID the sideloader renames the group; this build expects ALTAppGroups to carry the new name.`
    : diag.extensionGroup && diag.extensionGroup !== diag.resolvedGroup ? `The extension uses group "${diag.extensionGroup}" but the app resolved "${diag.resolvedGroup}".`
    : 'App Group reachable and the extension is embedded. If shares still do nothing, the log below shows what arrived.';
  const report = [...lines, '', ...entries.map((e) => `${new Date(e.at).toISOString()} ${e.kind}: ${e.text}`)].join('\n');
  return (
    <Page title="Share diagnostics">
      {verdict ? <Text size="sm" color={verdict.startsWith('App Group reachable') ? 'text2' : 'danger'}>{verdict}</Text> : <Text size="sm" color="text2">Only the iOS share extension uses an App Group; there is nothing to check on this platform.</Text>}
      {lines.length ? (
        <Group label="This install">
          <View style={{ padding: space[3], gap: 4 }}>
            {lines.map((l) => <Text key={l} size="xs" mono color="text2">{l}</Text>)}
          </View>
        </Group>
      ) : null}
      <Group label="Last events">
        <View style={{ padding: space[3], gap: 6 }}>
          {entries.length ? entries.map((e) => (
            <Text key={e.at + e.kind} size="xs" mono color={e.kind === 'error' ? 'danger' : 'text2'}>{new Date(e.at).toLocaleTimeString()} {e.kind} · {e.text}</Text>
          )) : <Text size="xs" color="text3">Nothing yet. Share something to engram, then come back here.</Text>}
        </View>
      </Group>
      <Button title="Copy report" variant="outline" onPress={() => { void Clipboard.setStringAsync(report); show('Copied'); }} />
    </Page>
  );
}
