import { useColorScheme } from 'react-native';
import { theme } from './theme';

export type Colors = Record<keyof (typeof theme.color)['light'], string>;

export function useTheme() {
  const scheme = useColorScheme();
  const c: Colors = theme.color[scheme === 'dark' ? 'dark' : 'light'];
  return { c, dark: scheme === 'dark', ...theme };
}
