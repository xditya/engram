import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';
import type { Entry } from './useLibrary';

// Up to five pinned cards, 132x96, hidden when empty.
export function PinnedStrip({ pinned, onPress }: { pinned: Entry[]; onPress: (id: string) => void }) {
  const { c, radius, space } = useTheme();
  if (!pinned.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[1], gap: space[2], paddingBottom: 10 }}>
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
            <View style={{ flex: 1, padding: 10, justifyContent: 'space-between' }}>
              <Text size="xs" weight={500} numberOfLines={3} style={{ lineHeight: 16 }}>{item.title ?? item.body ?? item.url ?? 'Untitled'}</Text>
              <Text size="xs" mono color="text3">{item.type}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}
