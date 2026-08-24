import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

// Settings row: title with the mono value and chevron on the same line, subtitle full-width beneath so a long
// subtitle never squeezes the value into a narrow column. `left` is an optional leading glyph.
export function Row({ title, subtitle, value, onPress, left }: { title: string; subtitle?: string; value?: string; onPress?: () => void; left?: ReactNode }) {
  const { c, space } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingVertical: 13, gap: space[3], backgroundColor: pressed && onPress ? c.surface2 : 'transparent' })}
    >
      {left ? <View style={{ width: 24, alignItems: 'center' }}>{left}</View> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Text size="sm" style={{ flex: 1 }}>{title}</Text>
          {value ? <Text size="xs" mono color="text3">{value}</Text> : null}
          {onPress ? <Text size="xs" color="text3">›</Text> : null}
        </View>
        {subtitle ? <Text size="xs" color="text2">{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}
