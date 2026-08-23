import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

// Settings row: title, optional subtitle, right-aligned mono value, chevron when pressable.
export function Row({ title, subtitle, value, onPress }: { title: string; subtitle?: string; value?: string; onPress?: () => void }) {
  const { c, space } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: space[3] }}
    >
      <View style={{ flex: 1 }}>
        <Text size="sm" style={{ fontSize: 15 }}>{title}</Text>
        {subtitle ? <Text size="xs" color="text2" style={{ fontSize: 13 }}>{subtitle}</Text> : null}
      </View>
      {value ? <Text size="xs" mono color="text3">{value}</Text> : null}
      {onPress ? <Text size="xs" color="text3" style={{ fontSize: 13 }}>›</Text> : null}
    </Pressable>
  );
}
