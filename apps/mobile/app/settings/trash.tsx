import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { Item } from '@engram/core';
import { useEngram, useLiveQuery, useToast } from '../../src/lib/engram';
import { InlineButton, n } from '../../src/features/settings/ui';
import { useTheme } from '../../src/theme/useTheme';
import { Hairline, Screen, Text, BackButton } from '../../src/ui';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

const DAY = 86_400_000;
const daysLeft = (deletedAt: number) => Math.max(0, Math.ceil((deletedAt + 30 * DAY - Date.now()) / DAY));

export default function Trash() {
  const { c, space } = useTheme();
  const router = useRouter();
  const { engram } = useEngram();
  const show = useToast((s) => s.show);
  const items = useLiveQuery((e) => e.db.items.list({ view: 'trash', sort: 'modified', limit: 1000 }), []) ?? [];

  const restore = (it: Item) => { engram?.db.items.restore(it.id); show('Restored'); };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: space[2], gap: space[1] }}>
        <BackButton />
        <Text size="xl" weight={600} style={{ flex: 1 }}>Let go</Text>
        {items.length ? <Text size="xs" mono color="text3" style={{ marginLeft: 'auto', marginRight: space[3] }}>{n(items.length)}</Text> : null}
      </View>
      <Text size="sm" color="text2" style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
        Cards you let go stay here for 30 days, then they are removed from every device.
      </Text>
      <FlashList
        data={items}
        keyExtractor={(it) => it.id}
        ItemSeparatorComponent={Hairline}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: space[7] }}
        ListEmptyComponent={<Text size="sm" color="text3" style={{ paddingVertical: space[6], textAlign: 'center' }}>Nothing let go.</Text>}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: space[3], backgroundColor: c.bg }}>
            <View style={{ flex: 1, paddingVertical: space[2] }}>
              <Text size="sm" numberOfLines={2}>{item.title ?? item.url ?? 'Untitled'}</Text>
              <Text size="xs" mono color="text3">{item.domain ? `${item.domain} · ` : ''}{daysLeft(item.deleted_at ?? Date.now())} d left</Text>
            </View>
            <InlineButton title="Restore" onPress={() => restore(item)} />
          </View>
        )}
      />
    </Screen>
  );
}
