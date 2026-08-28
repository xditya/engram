import { useEffect, useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeIn, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { db as coreDb, type Item } from '@engram/core';
import { ResurfaceCard } from '../src/features/resurface/ResurfaceCard';
import { Trace } from '../src/icons/Icon';
import { useEngram, useToast } from '../src/lib/engram';
import { useTheme } from '../src/theme/useTheme';
import { Button, Screen, Text } from '../src/ui';
import { ModalToast } from '../src/ui/Toast';

const MIN_SAVES = 50;
const SWIPE = 110;
type Verdict = 'keep' | 'letGo';

// A deck of faint cards. Drag right to keep (the trace strengthens), left to let go; the next two cards wait
// underneath. Every verdict is one gesture or one tap, and letting go can be undone from the toast.
export default function Resurface() {
  const { c, space, motion, radius } = useTheme();
  const { engram } = useEngram();
  const router = useRouter();
  const show = useToast((s) => s.show);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Snapshot once: acting on a card must not reshuffle the rest of the session.
  const session = useMemo<Item[]>(() => (engram ? coreDb.resurfaceCandidates(engram.platform.db, Date.now(), 20) : []), [engram]);
  const saves = useMemo(() => engram?.db.items.list({ limit: MIN_SAVES }).length ?? 0, [engram]);
  const [i, setI] = useState(0);
  const [done, setDone] = useState({ keep: 0, letGo: 0 });
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const progress = useSharedValue(0);
  const cardW = width - space[5] * 2;
  const cardH = Math.min(Math.round(height * 0.62), 620);

  useEffect(() => {
    progress.value = withTiming(session.length ? i / session.length : 0, { duration: motion.base });
  }, [i, session.length, progress, motion.base]);

  const commit = (v: Verdict) => {
    const item = session[i];
    if (!engram || !item) return;
    void Haptics.impactAsync(v === 'keep' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (v === 'keep') { engram.db.items.resurfaced(item.id); engram.db.items.opened(item.id); }
    else {
      engram.db.items.letGoFromResurface(item.id);
      show('Let go', 5000, { label: 'Undo', shake: true, onPress: () => { engram.db.items.restore(item.id); setDone((d) => ({ ...d, letGo: Math.max(0, d.letGo - 1) })); } });
    }
    setDone((d) => ({ ...d, [v]: d[v] + 1 }));
    x.value = 0; y.value = 0;
    setI(i + 1);
  };
  const flyOut = (v: Verdict) => {
    x.value = withTiming(v === 'keep' ? width * 1.2 : -width * 1.2, { duration: motion.slow }, () => runOnJS(commit)(v));
    y.value = withTiming(-40, { duration: motion.slow });
  };
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((g) => { x.value = g.translationX; y.value = g.translationY * 0.3; })
    .onEnd((g) => {
      if (Math.abs(g.translationX) > SWIPE || Math.abs(g.velocityX) > 900) runOnJS(flyOut)(g.translationX > 0 ? 'keep' : 'letGo');
      else { x.value = withSpring(0, { damping: 18, stiffness: 220 }); y.value = withSpring(0, { damping: 18, stiffness: 220 }); }
    });

  // Top card tilts with the drag; the stamps fade in with it; the cards behind rise as it leaves.
  const top = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${interpolate(x.value, [-width, width], [-14, 14])}deg` }] }));
  const keepStamp = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [20, SWIPE], [0, 1], Extrapolation.CLAMP) }));
  const goStamp = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-SWIPE, -20], [1, 0], Extrapolation.CLAMP) }));
  const second = useAnimatedStyle(() => { const t = interpolate(Math.abs(x.value), [0, SWIPE], [0, 1], Extrapolation.CLAMP); return { transform: [{ scale: 0.95 + 0.05 * t }, { translateY: 14 - 14 * t }] }; });
  const third = useAnimatedStyle(() => { const t = interpolate(Math.abs(x.value), [0, SWIPE], [0, 1], Extrapolation.CLAMP); return { transform: [{ scale: 0.9 + 0.05 * t }, { translateY: 28 - 14 * t }] }; });
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const item = session[i];
  const centre = { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[6], gap: space[4] } as const;
  if (saves < MIN_SAVES) {
    return (
      <Screen>
        <View style={centre}>
          <Trace size={40} color={c.text3} />
          <Text size="xl" weight={600} style={{ textAlign: 'center' }}>Resurface opens at {MIN_SAVES} saves</Text>
          <Text size="sm" color="text2" style={{ textAlign: 'center' }}>It brings back what you saved and never went back to. {MIN_SAVES - saves} more and there will be enough to sift.</Text>
          <Button title="Back" variant="outline" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }
  if (!item) {
    const total = done.keep + done.letGo;
    return (
      <Screen>
        <Animated.View entering={FadeIn.duration(motion.slow)} style={centre}>
          <Trace size={48} color={c.accent} />
          <Text size="xl" weight={600} style={{ textAlign: 'center' }}>{session.length ? 'That’s the lot.' : 'Nothing faint right now.'}</Text>
          {session.length ? (
            <View style={{ flexDirection: 'row', gap: space[5] }}>
              <View style={{ alignItems: 'center' }}><Text size="display" weight={600}>{done.keep}</Text><Text size="xs" mono color="text3">kept</Text></View>
              <View style={{ alignItems: 'center' }}><Text size="display" weight={600} color="text3">{done.letGo}</Text><Text size="xs" mono color="text3">let go</Text></View>
            </View>
          ) : null}
          <Text size="sm" color="text2" style={{ textAlign: 'center' }}>
            {session.length ? `${total} card${total === 1 ? '' : 's'} sifted. Anything let go stays recoverable for 30 days.` : 'Cards come back here once they have gone unopened for a while. Check again in a week or two.'}
          </Text>
          <Button title="Back to the library" onPress={() => router.back()} />
        </Animated.View>
      </Screen>
    );
  }
  const stamp = (label: string, color: string) => (
    <View style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 10, borderWidth: 2.5, borderColor: color, backgroundColor: c.surface, transform: [{ rotate: label === 'Keep' ? '-12deg' : '12deg' }] }}>
      <Text size="lg" weight={600} style={{ color, letterSpacing: 1 }}>{label}</Text>
    </View>
  );
  return (
    <Screen>
      <View style={{ height: 2, backgroundColor: c.surface2 }} accessibilityRole="progressbar">
        <Animated.View style={[{ height: 2, backgroundColor: c.accent }, bar]} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], height: 56 }}>
        <Text size="xl" weight={600} style={{ flex: 1 }}>Resurface</Text>
        <Text size="xs" mono color="text3">{i + 1} / {session.length}</Text>
        <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: space[2] }}>
          <Text size="lg" color="text2">✕</Text>
        </Pressable>
      </View>
      <Text size="sm" color="text2" style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>Swipe right to keep, left to let go. These have gone quiet.</Text>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: cardW, height: cardH }}>
          {session[i + 2] ? <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, third]}><ResurfaceCard item={session[i + 2]!} height={cardH} /></Animated.View> : null}
          {session[i + 1] ? <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, second]}><ResurfaceCard item={session[i + 1]!} height={cardH} /></Animated.View> : null}
          <GestureDetector gesture={pan}>
            <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6, borderRadius: radius.lg }, top]}>
              <ResurfaceCard item={item} height={cardH} />
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 18, left: 18 }, keepStamp]}>{stamp('Keep', c.accent)}</Animated.View>
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 18, right: 18 }, goStamp]}>{stamp('Let go', c.danger)}</Animated.View>
            </Animated.View>
          </GestureDetector>
        </View>
      </View>

      <View style={{ paddingHorizontal: space[4], paddingBottom: Math.max(insets.bottom, space[3]), gap: space[3] }}>
        <Pressable accessibilityRole="button" onPress={() => { engram?.db.items.opened(item.id); router.push(`/card/${item.id}`); }} style={{ alignSelf: 'center', minHeight: 36, justifyContent: 'center' }}>
          <Text size="sm" weight={500} color="accent">Open it first</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <Button title="Let go" variant="outline" danger height={52} style={{ flex: 1 }} onPress={() => flyOut('letGo')} />
          <Button title="Keep" height={52} style={{ flex: 1 }} onPress={() => flyOut('keep')} />
        </View>
      </View>
      <ModalToast bottom={52 + 36 + 24} />
    </Screen>
  );
}
