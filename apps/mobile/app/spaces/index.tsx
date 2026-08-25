import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SpaceList, type SpaceMeta } from '../../src/features/spaces/SpaceList';
import { SpaceSheet } from '../../src/features/spaces/SpaceSheet';
import { reorderSpaces, spaceItems } from '../../src/features/spaces/spaces';
import { thumbOf } from '../../src/features/spaces/thumb';
import { engram, useLiveQuery } from '../../src/lib/engram';
import { useTheme } from '../../src/theme/useTheme';
import { Button, Screen, Text, BackButton } from '../../src/ui';

export default function Spaces() {
  const { space } = useTheme();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const data = useLiveQuery((e) => {
    const spaces = e.db.spaces.list();
    const meta: Record<string, SpaceMeta> = {};
    for (const s of spaces) {
      const { items } = spaceItems(e, s);
      meta[s.id] = { count: items.length, thumbs: items.map((i) => thumbOf(e, i)?.uri).filter((u): u is string => !!u).slice(0, 4) };
    }
    return { spaces, meta };
  }, []);
  const create = (name: string, query: string) => {
    const s = engram().db.spaces.create(name, query || null);
    setCreating(false);
    router.push(`/spaces/${s.id}`);
  };
  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], gap: space[1] }}>
        <BackButton />
        <Text size="xl" weight={600} style={{ flex: 1 }}>Spaces</Text>
        {data?.spaces.length ? (
          <Pressable accessibilityRole="button" onPress={() => setCreating(true)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2] }}>
            <Text size="sm" weight={500} color="accent">New Space</Text>
          </Pressable>
        ) : null}
      </View>
      {!data ? null : data.spaces.length ? (
        <SpaceList spaces={data.spaces} meta={data.meta} onOpen={(s) => router.push(`/spaces/${s.id}`)} onReorder={(ids) => reorderSpaces(engram(), ids)} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[6], gap: space[4] }}>
          <Text size="lg" weight={500}>A Space is a search you keep.</Text>
          <Button title="New Space" onPress={() => setCreating(true)} />
        </View>
      )}
      <SpaceSheet open={creating} onSave={create} onClose={() => setCreating(false)} />
    </Screen>
  );
}
