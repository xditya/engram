import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { setAppIcon } from '@howincodes/expo-dynamic-app-icon';
import { useAppearance, type Scheme } from '../../src/features/settings/appearance';
import { Group, Page, RadioRow, ToggleRow } from '../../src/features/settings/ui';
import { useSettings, type AppIcon } from '../../src/lib/settings';
import { useTheme } from '../../src/theme/useTheme';
import { Text } from '../../src/ui';

const SCHEMES: { id: Scheme; label: string }[] = [{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }];
const ICONS: { id: AppIcon; label: string; src: number }[] = [
  { id: 'graphite', label: 'Graphite', src: require('../../assets/icons/graphite.png') },
  { id: 'paper', label: 'Paper', src: require('../../assets/icons/paper.png') },
  { id: 'indigo', label: 'Indigo', src: require('../../assets/icons/indigo.png') },
  { id: 'ink', label: 'Ink', src: require('../../assets/icons/ink.png') },
];

export default function AppearanceSettings() {
  const { scheme, oled, set } = useAppearance();
  const { c, space } = useTheme();
  const appIcon = useSettings((s) => s.ui.appIcon);
  const patch = useSettings((s) => s.patch);
  const pick = (id: AppIcon) => {
    patch('ui', { appIcon: id });
    // graphite is the built-in icon; the others are alternates. iOS confirms with a system alert.
    // Dev builds keep the built-in icon: the Android dev launcher starts MainActivity by explicit class, which the
    // icon module disables while an alias is active, so the next cold start would fail with ActivityNotFoundException.
    if (!__DEV__) setAppIcon(id === 'graphite' ? null : id).catch(() => {});
  };
  return (
    <Page title="Appearance">
      <Group label="Theme">
        {SCHEMES.map((s) => <RadioRow key={s.id} title={s.label} selected={scheme === s.id} onPress={() => set({ scheme: s.id })} />)}
      </Group>
      <Group label="Dark mode">
        <ToggleRow title="True black" subtitle="Pure black background on OLED screens." value={oled} onChange={(v) => set({ oled: v })} disabled={scheme === 'light'} />
      </Group>
      <Group label="App icon">
        <View style={{ padding: 14, gap: space[3] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {ICONS.map((i) => {
              const selected = i.id === appIcon;
              return (
                <Pressable key={i.id} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${i.label} icon`} onPress={() => pick(i.id)} style={{ alignItems: 'center', gap: space[1] }}>
                  <View style={{ padding: 3, borderRadius: 17, borderWidth: 2, borderColor: selected ? c.accent : 'transparent' }}>
                    <Image source={i.src} style={{ width: 64, height: 64, borderRadius: 14 }} />
                  </View>
                  <Text size="xs" color={selected ? 'text' : 'text2'} style={{ fontSize: 12 }}>{i.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text size="xs" color="text3" style={{ fontSize: 12 }}>Android may take a moment to update the launcher.</Text>
        </View>
      </Group>
    </Page>
  );
}
