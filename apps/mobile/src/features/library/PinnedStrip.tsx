import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Icon } from '../../icons/Icon';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';
import { typeIcon } from './format';
import type { Entry } from './useLibrary';

// Up to five pinned cards, 132x96, hidden when empty.
export function PinnedStrip({ pinned, onPress }: { pinned: Entry[]; onPress: (id: string) => void }) {
  const { c, radius, space } = useTheme();
  if (!pinned.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], gap: space[2], paddingBottom: space[3] }}>
      {pinned.map(({ item, uri }) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Pinned: ${item.title ?? item.type}`}
          onPress={() => onPress(item.id)}
          style={({ pressed }) => ({ width: 132, height: 96, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 })}
        >
          {uri ? (
            <Image source={{ uri }} style={{ width: 132, height: 96 }} contentFit="cover" accessibilityIgnoresInvertColors />
          ) : (
            <View style={{ flex: 1, padding: space[3], justifyContent: 'space-between' }}>
              <Icon name={typeIcon(item.type)} size={16} color={c.text3} />
              <Text size="xs" weight={500} numberOfLines={2} style={{ fontSize: 13 }}>{item.title ?? item.body ?? item.url ?? 'Untitled'}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}
