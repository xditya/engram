import { Pressable } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

export function Chip({ label, active, mono, onPress }: { label: string; active?: boolean; mono?: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={{
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 7,
        justifyContent: 'center',
        backgroundColor: active ? c.accentSoft : 'transparent',
        borderWidth: active ? 0 : 1,
        borderColor: c.line,
      }}
    >
      <Text size="sm" mono={mono} weight={500} color={active ? 'accent' : 'text2'}>
        {label}
      </Text>
    </Pressable>
  );
}
