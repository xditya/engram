import { useAppearance, type Scheme } from '../../src/features/settings/appearance';
import { Group, Page, RadioRow, ToggleRow } from '../../src/features/settings/ui';

const SCHEMES: { id: Scheme; label: string }[] = [{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }];

export default function AppearanceSettings() {
  const { scheme, oled, set } = useAppearance();
  return (
    <Page title="Appearance">
      <Group label="Theme">
        {SCHEMES.map((s) => <RadioRow key={s.id} title={s.label} selected={scheme === s.id} onPress={() => set({ scheme: s.id })} />)}
      </Group>
      <Group label="Dark mode">
        <ToggleRow title="True black" subtitle="Pure black background on OLED screens." value={oled} onChange={(v) => set({ oled: v })} disabled={scheme === 'light'} />
      </Group>
    </Page>
  );
}
