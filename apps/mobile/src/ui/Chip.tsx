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
        paddingVertical: active ? 5 : 4,
        paddingHorizontal: 10,
        borderRadius: 7,
        justifyContent: 'center',
        backgroundColor: active ? c.accentSoft : 'transparent',
        borderWidth: active ? 0 : 1,
        borderColor: c.line,
      }}
    >
      <Text size="xs" mono={mono} weight={active ? 500 : 400} color={active ? 'accent' : 'text2'}>
        {label}
      </Text>
    </Pressable>
  );
}
