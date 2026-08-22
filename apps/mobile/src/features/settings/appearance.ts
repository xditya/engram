import { Appearance } from 'react-native';
import { create } from 'zustand';
import { File, Paths } from 'expo-file-system';

export type Scheme = 'system' | 'light' | 'dark';
type Prefs = { scheme: Scheme; oled: boolean };
type State = Prefs & { set(p: Partial<Prefs>): void };

const file = () => new File(Paths.document, 'appearance.json');
const load = (): Prefs => {
  try { return { scheme: 'system', oled: false, ...(file().exists ? (JSON.parse(file().textSync()) as Partial<Prefs>) : {}) }; }
  catch { return { scheme: 'system', oled: false }; }
};

export const useAppearance = create<State>((set) => ({ ...load(), set: (p) => set(p) }));

// useTheme() reads useColorScheme(); forcing the scheme at the RN level is enough to drive it.
export function applyAppearance() {
  const { scheme } = useAppearance.getState();
  Appearance.setColorScheme(scheme === 'system' ? 'unspecified' : scheme);
}
useAppearance.subscribe((s) => {
  applyAppearance();
  try { file().write(JSON.stringify({ scheme: s.scheme, oled: s.oled })); } catch { /* web */ }
});
applyAppearance();
