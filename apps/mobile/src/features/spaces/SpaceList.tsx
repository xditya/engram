import { useEffect } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import type { Space } from '@engram/core';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';

export type SpaceMeta = { count: number; thumbs: string[] };
const GAP = 8;

// Long-press a row to drag it; the one manual ordering in the app. Rows share one height so
// positions are index * ROW, scaled with the font so large type still fits two lines.
export function SpaceList({ spaces, meta, onOpen, onReorder }: {
  spaces: Space[];
  meta: Record<string, SpaceMeta>;
  onOpen: (s: Space) => void;
  onReorder: (ids: string[]) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const row = Math.round(64 * Math.max(1, fontScale)) + GAP;
  const order = useSharedValue(spaces.map((s) => s.id));
  useEffect(() => { order.value = spaces.map((s) => s.id); }, [spaces, order]);
  return (
    <ScrollView contentContainerStyle={{ height: spaces.length * row, paddingHorizontal: 16 }}>
      {spaces.map((s) => (
        <Row key={s.id} space={s} meta={meta[s.id]} row={row} order={order} onOpen={onOpen} onReorder={onReorder} />
      ))}
    </ScrollView>
  );
}

function Row({ space: s, meta, row, order, onOpen, onReorder }: {
  space: Space; meta?: SpaceMeta; row: number; order: SharedValue<string[]>; onOpen: (s: Space) => void; onReorder: (ids: string[]) => void;
}) {
  const { c, radius, space: sp, motion } = useTheme();
  const y = useSharedValue(order.value.indexOf(s.id) * row);
  const dragging = useSharedValue(false);
  const start = useSharedValue(0);
  useAnimatedReaction(
    () => order.value.indexOf(s.id) * row,
    (to) => { if (!dragging.value) y.value = withTiming(to, { duration: motion.base }); },
  );
  const pan = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart(() => { dragging.value = true; start.value = y.value; })
    .onUpdate((g) => {
      y.value = start.value + g.translationY;
      const from = order.value.indexOf(s.id);
      const to = Math.min(order.value.length - 1, Math.max(0, Math.round(y.value / row)));
      if (to !== from) { const o = order.value.slice(); o.splice(from, 1); o.splice(to, 0, s.id); order.value = o; }
    })
    .onFinalize(() => {
      dragging.value = false;
      y.value = withTiming(order.value.indexOf(s.id) * row, { duration: motion.base });
      runOnJS(onReorder)(order.value);
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scale: withTiming(dragging.value ? 1.02 : 1, { duration: motion.fast }) }],
    zIndex: dragging.value ? 1 : 0,
  }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ position: 'absolute', left: 16, right: 16, height: row - GAP }, style]}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Long press and drag to reorder"
          onPress={() => onOpen(s)}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: sp[3], paddingHorizontal: sp[4], backgroundColor: c.surface, borderRadius: radius.md }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text size="sm" weight={500} numberOfLines={1}>{s.name}</Text>
            <Text size="xs" mono color="text3" numberOfLines={1}>{s.query?.trim() || 'no query'}</Text>
          </View>
          <Text size="xs" mono color="text3">{meta?.count ?? 0}</Text>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ width: 24, height: 24, borderRadius: radius.sm, backgroundColor: c.surface2, overflow: 'hidden' }}>
                {meta?.thumbs[i] ? <Image source={{ uri: meta.thumbs[i] }} style={{ width: 24, height: 24 }} contentFit="cover" /> : null}
              </View>
            ))}
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}
