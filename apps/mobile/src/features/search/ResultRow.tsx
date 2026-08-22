import { Pressable, View } from 'react-native';
import { Icon, type IconName } from '../../icons/Icon';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';
import type { Hit } from './useSearch';

const ICON: Partial<Record<Hit['type'], IconName>> = {
  note: 'type-note', link: 'type-link', article: 'type-article', image: 'type-image', video: 'type-video',
  pdf: 'type-pdf', quote: 'type-quote', product: 'type-product',
};

// ponytail: local row until the library feature exports a list row; swap for that when it lands.
export function ResultRow({ item, onPress }: { item: Hit; onPress: () => void }) {
  const { c, space } = useTheme();
  const title = item.title || item.body?.split('\n')[0] || item.url || 'Untitled';
  const meta = [item.semantic ? '~ semantic' : null, item.domain].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2] }}>
      <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={ICON[item.type] ?? 'type-link'} size={18} color={c.text3} />
      </View>
      <View style={{ flex: 1 }}>
        <Text size="sm" weight={500} numberOfLines={1}>{item.semantic ? `~ ${title}` : title}</Text>
        {meta ? <Text size="xs" mono color="text3" numberOfLines={1}>{meta}</Text> : null}
      </View>
    </Pressable>
  );
}
