import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

// The one back control every pushed screen uses: 44 pt target, a chevron drawn large enough to read as a button.
export function BackButton({ onPress }: { onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onPress ?? (() => router.back())} hitSlop={8} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
      <Text style={{ fontSize: 34, lineHeight: 40, color: c.text2, marginTop: -4 }}>‹</Text>
    </Pressable>
  );
}
