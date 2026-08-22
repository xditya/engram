import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Icon } from '../../icons/Icon';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';
import { shortDate, typeIcon } from './format';
import type { Entry } from './useLibrary';

export function ListRow({ entry, dense, selecting, selected, onPress, onLongPress }: {
  entry: Entry; dense: boolean; selecting: boolean; selected: boolean; onPress: () => void; onLongPress: () => void;
}) {
  const { c, dark, space } = useTheme();
  const { item, uri } = entry;
  const size = dense ? 32 : 40;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title ?? item.type}
      accessibilityState={{ selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: dense ? 44 : 56, paddingHorizontal: space[3], gap: space[3], backgroundColor: selected ? c.accentSoft : pressed ? c.surface2 : c.surface })}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 6, backgroundColor: c.surface2 }} contentFit="cover" accessibilityIgnoresInvertColors />
      ) : (
        <View style={{ width: size, height: size, borderRadius: 6, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={typeIcon(item.type)} size={18} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text size="sm" weight={500} numberOfLines={1}>{item.title ?? item.body?.split('\n')[0] ?? item.url ?? 'Untitled'}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {item.domain ? <Text size="xs" color="text2" numberOfLines={1} style={{ flexShrink: 1 }}>{item.domain}{' · '}</Text> : null}
          <Text size="xs" mono color="text2" style={{ fontSize: 11 }}>{shortDate(item.created_at)}</Text>
        </View>
      </View>
      {selecting ? (
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: selected ? 0 : 1.5, borderColor: c.line, backgroundColor: selected ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <Text size="xs" weight={600} style={{ color: dark ? c.bg : '#FFFFFF' }}>{'✓'}</Text> : null}
        </View>
      ) : (
        <Icon name={typeIcon(item.type)} size={16} color={c.text3} />
      )}
    </Pressable>
  );
}
