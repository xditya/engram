import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

export function Hairline() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />;
}
