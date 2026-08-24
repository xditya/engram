import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ItemGrid, toEntry } from '../../src/features/spaces/ItemGrid';
import { SpaceSheet } from '../../src/features/spaces/SpaceSheet';
import { deleteSpace, exportSpace, setSpace, spaceItems } from '../../src/features/spaces/spaces';
import { Icon } from '../../src/icons/Icon';
import { engram, useLiveQuery, useSettings, useToast } from '../../src/lib/engram';
import { useTheme } from '../../src/theme/useTheme';
import { Screen, Text } from '../../src/ui';

// Library filtered by one Space: its query hits plus cards added by hand.
export default function SpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { space } = useTheme();
  const router = useRouter();
  const view = useSettings((s) => s.ui.view);
  const patch = useSettings((s) => s.patch);
  const show = useToast((s) => s.show);
  const [editing, setEditing] = useState(false);
  const data = useLiveQuery((e) => {
    const s = e.db.spaces.list().find((x) => x.id === id);
    if (!s) return null;
    const { items, manual } = spaceItems(e, s);
    return { space: s, manual, entries: items.map(toEntry) };
  }, [id]);

  const iconBtn = { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' } as const;
  const header = data ? (
    <View style={{ paddingHorizontal: view === 'grid' ? 4 : 0, paddingBottom: space[3], gap: space[1] }}>
      <Text size="sm" mono color="text3">{data.space.query?.trim() || 'no query'}</Text>
      {data.manual ? <Text size="xs" mono color="text3">+ {data.manual} added by hand</Text> : null}
    </View>
  ) : undefined;

  return (
    <Screen>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], gap: space[1] }}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={() => router.back()} style={iconBtn}>
          <Text size="lg" color="text2">‹</Text>
        </Pressable>
        <Text weight={600} numberOfLines={1} style={{ flex: 1 }}>{data?.space.name ?? ''}</Text>
        <Pressable accessibilityLabel={view === 'grid' ? 'Show as list' : 'Show as grid'} accessibilityRole="button" onPress={() => patch('ui', { view: view === 'grid' ? 'list' : 'grid' })} style={iconBtn}>
          <Icon name={view === 'grid' ? 'view-list' : 'view-grid'} />
        </Pressable>
        <Pressable accessibilityLabel="Edit Space" accessibilityRole="button" onPress={() => setEditing(true)} style={iconBtn}>
          <Text size="lg" color="text2">···</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => { if (data) exportSpace(engram(), data.space).catch((e: Error) => show(`Couldn't export: ${e.message}`)); }}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2] }}
        >
          <Text size="sm" weight={500} color="accent">Export Space</Text>
        </Pressable>
      </View>
      {!data ? null : data.entries.length ? (
        <ItemGrid entries={data.entries} header={header} />
      ) : (
        <View style={{ flex: 1, gap: space[4] }}>
          <View style={{ paddingHorizontal: space[4] }}>{header}</View>
          <Text size="sm" color="text2" style={{ textAlign: 'center', paddingHorizontal: space[6] }}>Nothing matches yet.</Text>
        </View>
      )}
      <SpaceSheet
        open={editing}
        initial={data ? { name: data.space.name, query: data.space.query } : undefined}
        onSave={(name, query) => { setSpace(engram(), id!, { name, query: query || null }); setEditing(false); }}
        onClose={() => setEditing(false)}
        onDelete={() => { setEditing(false); deleteSpace(engram(), id!); router.back(); }}
      />
    </Screen>
  );
}
