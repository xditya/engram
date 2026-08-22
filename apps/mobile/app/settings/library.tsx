import { useSettings } from '../../src/lib/engram';
import { Group, Page, RadioRow, ToggleRow } from '../../src/features/settings/ui';

export default function LibrarySettings() {
  const ui = useSettings((s) => s.ui);
  const patch = useSettings((s) => s.patch);
  return (
    <Page title="Library">
      <Group label="Default view">
        <RadioRow title="Grid" selected={ui.view === 'grid'} onPress={() => patch('ui', { view: 'grid' })} />
        <RadioRow title="List" selected={ui.view === 'list'} onPress={() => patch('ui', { view: 'list' })} />
      </Group>
      <Group label="Density">
        <RadioRow title="Cozy" selected={ui.density === 'cozy'} onPress={() => patch('ui', { density: 'cozy' })} />
        <RadioRow title="Compact" selected={ui.density === 'compact'} onPress={() => patch('ui', { density: 'compact' })} />
      </Group>
      <Group label="Trace">
        <ToggleRow title="Trace indicator" subtitle="A small mark on each card that fades as you forget it." value={ui.traceIndicator} onChange={(v) => patch('ui', { traceIndicator: v })} />
      </Group>
    </Page>
  );
}
