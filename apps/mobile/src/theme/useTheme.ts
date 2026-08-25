import { useColorScheme } from 'react-native';
import { theme } from './theme';
import { useAppearance } from '../features/settings/appearance';

export type Colors = Record<keyof (typeof theme.color)['light'], string>;

export function useTheme() {
  const scheme = useColorScheme();
  const oled = useAppearance((s) => s.oled);
  const base = theme.color[scheme === 'dark' ? 'dark' : 'light'];
  // True black paints only the ground; cards keep a step of contrast or they vanish.
  const c: Colors = oled && scheme === 'dark' ? { ...base, bg: '#000', surface: '#111317', surface2: '#1A1D22', line: '#22252B' } : base;
  return { c, dark: scheme === 'dark', ...theme };
}
