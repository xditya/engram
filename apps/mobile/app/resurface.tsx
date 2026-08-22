import { useEffect, useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { db as coreDb, type Item } from '@engram/core';
import { ResurfaceCard } from '../src/features/resurface/ResurfaceCard';
import { useEngram } from '../src/lib/engram';
import { useTheme } from '../src/theme/useTheme';
import { Button, Screen, Text } from '../src/ui';

const MIN_SAVES = 50;
type Verdict = 'strengthen' | 'letGo';

export default function Resurface() {
  const { c, space, motion } = useTheme();
  const { engram } = useEngram();
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Snapshot once: acting on a card must not reshuffle the rest of the session.
  const session = useMemo<Item[]>(() => (engram ? coreDb.resurfaceCandidates(engram.platform.db, Date.now(), 20) : []), [engram]);
  const saves = useMemo(() => engram?.db.items.list({ limit: MIN_SAVES }).length ?? 0, [engram]);
  const [i, setI] = useState(0);
  const [done, setDone] = useState({ strengthen: 0, letGo: 0 });
  const x = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(session.length ? i / session.length : 0, { duration: motion.base });
  }, [i, session.length, progress, motion.base]);

  const commit = (v: Verdict) => {
    const item = session[i];
    if (!engram || !item) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (v === 'strengthen') { engram.db.items.resurfaced(item.id); engram.db.items.opened(item.id); }
    else engram.db.items.letGoFromResurface(item.id);
    setDone((d) => ({ ...d, [v]: d[v] + 1 }));
    x.value = 0;
    setI(i + 1);
  };
  const slideOut = (v: Verdict) => {
    x.value = withTiming(v === 'strengthen' ? width : -width, { duration: motion.base }, () => runOnJS(commit)(v));
  };
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((g) => { x.value = g.translationX; })
    .onEnd((g) => {
      if (Math.abs(g.translationX) > 96 || Math.abs(g.velocityX) > 800) runOnJS(slideOut)(g.translationX > 0 ? 'strengthen' : 'letGo');
      else x.value = withTiming(0, { duration: motion.fast });
    });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const item = session[i];
  const centre = { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[5], gap: space[4] } as const;
  if (saves < MIN_SAVES) {
    return (
      <Screen>
        <View style={centre}>
          <Text size="lg" weight={500} style={{ textAlign: 'center' }}>Resurface opens at {MIN_SAVES} saves.</Text>
          <Text size="sm" mono color="text2">{MIN_SAVES - saves} to go.</Text>
          <Button title="Back" variant="outline" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }
  if (!item) {
    return (
      <Screen>
        <View style={centre}>
          <Text size="lg" weight={500} style={{ textAlign: 'center' }}>
            {session.length ? `Done. ${done.strengthen} strengthened, ${done.letGo} let go.` : 'Nothing faint right now.'}
          </Text>
          <Button title="Back" variant="outline" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }
  return (
    <Screen>
      <View style={{ height: 2, backgroundColor: c.surface2 }} accessibilityRole="progressbar">
        <Animated.View style={[{ height: 2, backgroundColor: c.accent }, bar]} />
      </View>
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={() => router.back()}
        style={{ alignSelf: 'flex-end', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: space[2] }}
      >
        <Text size="lg" color="text2">✕</Text>
      </Pressable>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1, justifyContent: 'center', paddingHorizontal: space[5] }, slide]}>
          <ResurfaceCard item={item} />
        </Animated.View>
      </GestureDetector>
      <View style={{ flexDirection: 'row', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[4] }}>
        <Button title="Let go" variant="outline" height={52} style={{ flex: 1 }} onPress={() => slideOut('letGo')} />
        <Button title="Strengthen" height={52} style={{ flex: 1 }} onPress={() => slideOut('strengthen')} />
      </View>
    </Screen>
  );
}
