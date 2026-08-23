import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, Keyboard, Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming, type EasingFunction, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Icon, Trace } from '../../icons/Icon';
import { engram, useLiveQuery, type ShareIntentLike } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Button, Text, useKeyboardHeight } from '../../ui';
import { describe, glyph } from '../capture/ShareSheet';
import { SpaceChips, Tags } from '../detail/MetaBar';
import { thumbOf } from '../spaces/thumb';

const EASE = Easing.bezier(0.33, 1, 0.68, 1);
const NEVER = ReduceMotion.Never; // reduced motion is handled here by hand, so Reanimated must not skip
const tm = (to: number, duration: number, delay = 0, easing: EasingFunction | typeof EASE = EASE) => withDelay(delay, withTiming(to, { duration, easing, reduceMotion: NEVER }), NEVER);
const IDLE_MS = 7000;
const CARD_H = 88, ROW_H = 64, TRACE = 28, SLOT = { x: 25, y: 32 }; // where the trace sets down inside the stage

// Rest values for every shared value; a tap during the sequence jumps straight here.
const REST = { scrim: 1, sheetY: 0, sheetOp: 1, clock: 1, cardOp: 0, contentOp: 0, traceOp: 1, settle: 1, size: 22 / TRACE, stageH: ROW_H, rowOp: 1, rowX: 0, rowContentOp: 1, belowOp: 1, pillOp: 0, pillY: -8, pillScale: 1 };

// The Save Moment: the sheet rises with the preview card; the card is pressed into the trace glyph, which sets
// down where the memory row's mark lives; the row grows back out of it while the Saved pill springs in.
// The save is committed before frame 0 — nothing here waits on network.
export function ShareOverlay({ intent, error, finish }: { intent: ShareIntentLike; error?: string; finish: () => void }) {
  const { c, dark, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const reduced = useReducedMotion();
  const d = describe(intent);
  const [id, setId] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(error ?? null);
  const [spacesOpen, setSpacesOpen] = useState(false);
  const item = useLiveQuery((e) => (id ? e.db.items.get(id) : undefined), [id]);
  const tags = useLiveQuery((e) => (id ? e.db.tags.of(id) : []), [id]) ?? [];
  const thumb = useLiveQuery((e) => (item ? thumbOf(e, item)?.uri : undefined), [item?.id]);
  const hasSpaces = (useLiveQuery((e) => e.db.spaces.list().length, []) ?? 0) > 0;
  const title = item?.title && item.title !== item.domain ? item.title : d.title;
  const domain = item?.domain ?? d.meta;

  const scrim = useSharedValue(0), sheetY = useSharedValue(238), sheetOp = useSharedValue(reduced ? 0 : 1);
  const clock = useSharedValue(0), cardOp = useSharedValue(1), contentOp = useSharedValue(1);
  const traceOp = useSharedValue(0), settle = useSharedValue(1.06), size = useSharedValue(1), stageH = useSharedValue(CARD_H);
  const rowOp = useSharedValue(0), rowX = useSharedValue(-12), rowContentOp = useSharedValue(0), belowOp = useSharedValue(0);
  const pillOp = useSharedValue(0), pillY = useSharedValue(16), pillScale = useSharedValue(0.85);
  const sheetH = useSharedValue(238);
  const all: Record<keyof typeof REST, SharedValue<number>> = { scrim, sheetY, sheetOp, clock, cardOp, contentOp, traceOp, settle, size, stageH, rowOp, rowX, rowContentOp, belowOp, pillOp, pillY, pillScale };
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  const rest = useCallback(() => {
    timers.current.forEach(clearTimeout); timers.current = [];
    for (const k of Object.keys(all) as (keyof typeof REST)[]) { cancelAnimation(all[k]); all[k].value = REST[k]; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save at once, then play the timeline from t = 0 regardless: every value is a withDelay off this mount.
  useEffect(() => {
    if (!error) engram().capture.fromShareIntent(intent).then((items) => { if (!items[0]) throw new Error('nothing to save'); setId(items[0].id); }).catch((e: Error) => setFailed(e.message));
    scrim.value = tm(1, 120);
    if (reduced) {
      sheetY.value = 0; sheetOp.value = tm(1, 200);
      cardOp.value = tm(0, 200, 600); contentOp.value = tm(0, 200, 600);
      traceOp.value = tm(1, 200, 600); settle.value = 1; size.value = 22 / TRACE; stageH.value = tm(ROW_H, 200, 600);
      rowOp.value = tm(1, 200, 600); rowX.value = 0; rowContentOp.value = tm(1, 200, 600); belowOp.value = tm(1, 200, 600);
      pillOp.value = tm(1, 120, 800); pillY.value = 0; pillScale.value = 1;
    } else {
      sheetY.value = tm(0, 320);
      contentOp.value = tm(0, 120, 360);
      clock.value = tm(1, 320, 400); // one clock → translate, rotate, scale
      cardOp.value = tm(0, 60, 700, Easing.linear); traceOp.value = tm(1, 60, 700, Easing.linear);
      settle.value = tm(1, 120, 760);
      size.value = tm(22 / TRACE, 200, 800); stageH.value = tm(ROW_H, 200, 800);
      rowOp.value = tm(1, 200, 800); rowX.value = tm(0, 200, 800); rowContentOp.value = tm(1, 140, 860); belowOp.value = tm(1, 200, 900);
      pillOp.value = tm(1, 120, 800);
      pillY.value = withDelay(800, withSpring(0, { damping: 14, stiffness: 220, mass: 1, reduceMotion: NEVER }), NEVER);
      pillScale.value = withDelay(800, withSpring(1, { damping: 14, stiffness: 220, mass: 1, reduceMotion: NEVER }), NEVER);
    }
    at(800, () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); AccessibilityInfo.announceForAccessibility('Saved to engram'); });
    at(2400, () => { pillOp.value = tm(0, 200); pillY.value = tm(-8, 200); });
    return () => timers.current.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A failed save keeps the card on screen with the reason; nothing to press into a trace.
  useEffect(() => {
    if (!failed) return;
    rest();
    clock.value = 0; cardOp.value = 1; contentOp.value = 1; traceOp.value = 0; stageH.value = CARD_H; rowOp.value = 0;
  }, [failed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Return: sheet drops (or fades) and the scrim clears, then the activity finishes.
  const leaving = useRef(false);
  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    rest();
    scrim.value = tm(0, 200);
    if (reduced) sheetOp.value = tm(0, 200); else sheetY.value = tm(sheetH.value, 200);
    setTimeout(finish, 200);
  }, [finish, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-return after ~7 s of quiet; any touch restarts the clock, an open keyboard pauses it.
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touch = useCallback(() => { clearTimeout(idle.current); idle.current = setTimeout(leave, IDLE_MS); }, [leave]);
  useEffect(() => {
    touch();
    const show = Keyboard.addListener('keyboardDidShow', () => clearTimeout(idle.current));
    const hide = Keyboard.addListener('keyboardDidHide', touch);
    const back = BackHandler.addEventListener('hardwareBackPress', () => { leave(); return true; });
    return () => { clearTimeout(idle.current); show.remove(); hide.remove(); back.remove(); };
  }, [touch, leave]);

  const openCard = () => { if (id) void Linking.openURL(`engram://card/${id}`); leave(); };

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const sheetStyle = useAnimatedStyle(() => ({ opacity: sheetOp.value, transform: [{ translateY: sheetY.value }] }));
  const stageStyle = useAnimatedStyle(() => ({ height: stageH.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOp.value,
    transform: [{ translateX: -154 * clock.value }, { translateY: -12 * clock.value }, { rotate: `${-37 * clock.value}deg` }, { scaleX: 1 - 0.927 * clock.value }, { scaleY: 1 - 0.972 * clock.value }],
  }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOp.value }));
  const traceStyle = useAnimatedStyle(() => ({ opacity: traceOp.value, transform: [{ scale: settle.value * size.value }] }));
  const rowStyle = useAnimatedStyle(() => ({ opacity: rowOp.value, transform: [{ translateX: rowX.value }] }));
  const rowContentStyle = useAnimatedStyle(() => ({ opacity: rowContentOp.value }));
  const belowStyle = useAnimatedStyle(() => ({ opacity: belowOp.value }));
  const pillStyle = useAnimatedStyle(() => ({ opacity: pillOp.value, transform: [{ translateY: pillY.value }, { scale: pillScale.value }] }));

  const typeGlyph = <Icon name={glyph[d.type] ?? 'type-link'} />;
  return (
    <View style={StyleSheet.absoluteFill} onStartShouldSetResponderCapture={() => { touch(); if (!leaving.current && !failed) rest(); return false; }}>
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
        <Pressable accessibilityLabel="Close" onPress={leave} style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(0,0,0,0.5)' : 'rgba(21,23,26,0.32)' }]} />
      </Animated.View>
      <Animated.View
        onLayout={(e) => { sheetH.value = e.nativeEvent.layout.height; }}
        style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: space[4], paddingBottom: Math.max(insets.bottom, kb) + space[4], gap: space[3] }, sheetStyle]}
      >
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -(44 + 16), alignSelf: 'center', height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: c.text, justifyContent: 'center' }, pillStyle]}>
          <Text weight={500} style={{ fontSize: 15, color: c.bg }}>Saved</Text>
        </Animated.View>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.line, marginVertical: space[2] }} />

        <Animated.View style={stageStyle}>
          {/* The card: its own surface becomes the sliver; content is a child that fades first so no text squashes. */}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: CARD_H, borderRadius: 12, backgroundColor: c.surface, justifyContent: 'center', padding: space[3] }, cardStyle]}>
            <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: space[3] }, contentStyle]}>
              <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {d.type === 'image' && intent.files?.[0] ? <Image source={{ uri: intent.files[0].path }} style={{ width: 40, height: 40 }} contentFit="cover" /> : typeGlyph}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" weight={500} numberOfLines={1} style={{ fontSize: 15 }}>{d.title}</Text>
                <Text size="xs" mono color={failed ? 'danger' : 'text3'} numberOfLines={1} style={{ marginTop: 2 }}>{failed ? `Couldn't save · ${failed}` : d.meta}</Text>
              </View>
            </Animated.View>
          </Animated.View>
          {/* The memory row grows back out of the glyph; it leaves the glyph's 22 pt slot empty on its left. */}
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: ROW_H, borderRadius: 12, backgroundColor: c.surface }, rowStyle]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Saved. Open ${title} in engram`} disabled={!id} onPress={openCard}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: SLOT.x + 11 + 10, paddingRight: space[3] }}>
              <Animated.View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3] }, rowContentStyle]}>
                <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {typeGlyph}
                  {thumb ? <Animated.View entering={FadeIn.duration(200).easing(EASE)} style={StyleSheet.absoluteFill}><Image source={{ uri: thumb }} style={{ width: 40, height: 40 }} contentFit="cover" /></Animated.View> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Animated.View key={title} entering={FadeIn.duration(200).easing(EASE)}><Text size="sm" weight={500} numberOfLines={1} style={{ fontSize: 15 }}>{title}</Text></Animated.View>
                  <Text size="xs" mono color="text3" numberOfLines={1} style={{ marginTop: 2 }}>{domain}</Text>
                </View>
                <Text size="md" color="text3">›</Text>
              </Animated.View>
            </Pressable>
          </Animated.View>
          {/* The trace, pre-mounted at the matched footprint and above the row; only its wrapper animates. Accent here, text elsewhere. */}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: SLOT.x - TRACE / 2, top: SLOT.y - TRACE / 2, width: TRACE, height: TRACE }, traceStyle]}>
            <Trace size={TRACE} color={c.accent} />
          </Animated.View>
        </Animated.View>

        <Animated.View style={[{ gap: space[3] }, belowStyle]}>
          {item ? <Tags item={item} tags={tags} pending compact /> : <View style={{ height: 32 }} />}
          {spacesOpen && id ? <SpaceChips itemId={id} /> : null}
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            {hasSpaces && !spacesOpen && !failed ? <Button title="Add to Space" variant="outline" height={44} onPress={() => setSpacesOpen(true)} style={{ flex: 1 }} /> : null}
            <Button title="Done" variant="outline" height={44} onPress={leave} style={{ flex: 1 }} />
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
