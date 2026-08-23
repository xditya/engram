import { Platform as RN } from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '../../src/lib/engram';
import { Row } from '../../src/ui';
import { Group, Page, RadioRow, ToggleRow } from '../../src/features/settings/ui';

export default function LibrarySettings() {
  const ui = useSettings((s) => s.ui);
  const patch = useSettings((s) => s.patch);
  const s = useSettings();
  const router = useRouter();
  return (
    <Page title="Library">
      <Group label="Default view">
        <RadioRow title="Grid" selected={ui.view === 'grid'} onPress={() => patch('ui', { view: 'grid' })} />
        <RadioRow title="List" selected={ui.view === 'list'} onPress={() => patch('ui', { view: 'list' })} />
      </Group>
      <Group label="Density">
        <RadioRow title="Comfortable" selected={ui.density === 'comfortable'} onPress={() => patch('ui', { density: 'comfortable' })} />
        <RadioRow title="Normal" selected={ui.density === 'cozy'} onPress={() => patch('ui', { density: 'cozy' })} />
        <RadioRow title="Dense" selected={ui.density === 'compact'} onPress={() => patch('ui', { density: 'compact' })} />
      </Group>
      <Group label="Trace">
        <ToggleRow title="Trace indicator" subtitle="A small mark on each card that fades as you forget it." value={ui.traceIndicator} onChange={(v) => patch('ui', { traceIndicator: v })} />
      </Group>
      {RN.OS === 'android' ? (
        <Group label="Capture">
          <Row title="Screenshots" subtitle="Offer to save each screenshot you take" value={s.capture.screenshotWatch ? 'On' : 'Off'} onPress={() => router.push('/settings/screenshots' as never)} />
        </Group>
      ) : null}
    </Page>
  );
}
