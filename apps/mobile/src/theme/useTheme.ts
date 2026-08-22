import { useColorScheme } from 'react-native';
import { theme } from './theme';
import { useAppearance } from '../features/settings/appearance';

export type Colors = Record<keyof (typeof theme.color)['light'], string>;

export function useTheme() {
  const scheme = useColorScheme();
  const oled = useAppearance((s) => s.oled);
  const base = theme.color[scheme === 'dark' ? 'dark' : 'light'];
  const c: Colors = oled && scheme === 'dark' ? { ...base, bg: '#000', surface: '#000' } : base;
  return { c, dark: scheme === 'dark', ...theme };
}
