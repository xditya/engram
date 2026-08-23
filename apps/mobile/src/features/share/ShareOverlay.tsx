import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Linking, Pressable, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import type { Item } from '@engram/core';
import { Icon, Trace } from '../../icons/Icon';
import { engram, useLiveQuery, type ShareIntentLike } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Button, Hairline, Sheet, Text } from '../../ui';
import { describe, glyph } from '../capture/ShareSheet';
import { SpaceChips, Tags } from '../detail/MetaBar';

const ease = Easing.out(Easing.cubic);
const IDLE_MS = 6000;

// Over the sharing app: the preview card slides up with the sheet, folds into the trace mark once the
// save has landed, the Saved pill springs in, then tags and Spaces fade in for editing.
export function ShareOverlay({ intent, error, finish }: { intent: ShareIntentLike; error?: string; finish: () => void }) {
  const { c, space, motion } = useTheme();
  const d = describe(intent);
  const [item, setItem] = useState<Item | null>(null);
  const [failed, setFailed] = useState<string | null>(error ?? null);
  const [editing, setEditing] = useState(false);
  const tags = useLiveQuery((e) => (item ? e.db.tags.of(item.id) : []), [item?.id]) ?? [];

  // Save at once (local only, never fetches); the fold waits for the sheet's own slide to finish.
  useEffect(() => {
    if (error) return;
    const t0 = Date.now();
    engram().capture.fromShareIntent(intent)
      .then((items) => {
        const first = items[0];
        if (!first) throw new Error('nothing to save');
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTimeout(() => setItem(first), Math.max(0, motion.slow - (Date.now() - t0)));
      })
      .catch((e: Error) => setFailed(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fold = useSharedValue(0); // 0 = preview card, 1 = trace mark
  const pill = useSharedValue(0.6);
  useEffect(() => {
    if (!item) return;
    fold.value = withTiming(1, { duration: motion.slow, easing: ease });
    pill.value = withDelay(motion.slow, withSpring(1, { damping: 9, stiffness: 220 })); // the one spring overshoot
    const t = setTimeout(() => setEditing(true), motion.slow + motion.base);
    return () => clearTimeout(t);
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps
  const cardStyle = useAnimatedStyle(() => ({ opacity: 1 - fold.value, transform: [{ scale: 1 - 0.8 * fold.value }, { translateY: -12 * fold.value }] }));
  const markStyle = useAnimatedStyle(() => ({ opacity: fold.value }));
  const pillStyle = useAnimatedStyle(() => ({ opacity: fold.value, transform: [{ scale: pill.value }] }));

  // Dismiss after a quiet 6 s; any touch restarts the clock, an open keyboard pauses it.
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touch = useCallback(() => { clearTimeout(idle.current); idle.current = setTimeout(finish, IDLE_MS); }, [finish]);
  useEffect(() => {
    touch();
    const show = Keyboard.addListener('keyboardDidShow', () => clearTimeout(idle.current));
    const hide = Keyboard.addListener('keyboardDidHide', touch);
    const back = BackHandler.addEventListener('hardwareBackPress', () => { finish(); return true; });
    return () => { clearTimeout(idle.current); show.remove(); hide.remove(); back.remove(); };
  }, [touch, finish]);

  const openCard = () => { if (item) void Linking.openURL(`engram://card/${item.id}`); finish(); };

  return (
    <Sheet open onClose={finish}>
      <View onStartShouldSetResponderCapture={() => { touch(); return false; }} style={{ paddingTop: space[2], gap: space[2] }}>
        <View style={{ height: 68, justifyContent: 'center' }}>
          <Animated.View pointerEvents="none" style={[{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: c.bg, borderRadius: 12, padding: space[3] }, cardStyle]}>
            <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {d.type === 'image' && intent.files?.[0] ? <Image source={{ uri: intent.files[0].path }} style={{ width: 44, height: 44 }} contentFit="cover" /> : <Icon name={glyph[d.type] ?? 'type-link'} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" weight={500} numberOfLines={1}>{d.title}</Text>
              <Text size="xs" mono color="text3" style={{ marginTop: 3 }}>{failed ? `Couldn't save · ${failed}` : d.meta}</Text>
            </View>
          </Animated.View>
          {item ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Saved. Open ${d.title} in engram`} onPress={openCard}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
              <Animated.View style={markStyle}><Trace size={20} /></Animated.View>
              <Animated.View style={[{ height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: c.text, justifyContent: 'center' }, pillStyle]}>
                <Text weight={500} style={{ fontSize: 15, color: c.bg }}>Saved</Text>
              </Animated.View>
            </Pressable>
          ) : null}
        </View>
        {item && editing ? (
          <Animated.View entering={FadeIn.duration(motion.base)}>
            <Hairline />
            <Tags item={item} tags={tags} />
            <SpaceChips itemId={item.id} before={<Hairline />} />
            <Button title="Done" variant="outline" onPress={finish} style={{ marginTop: space[2] }} />
          </Animated.View>
        ) : failed ? (
          <Button title="Done" variant="outline" onPress={finish} />
        ) : null}
      </View>
    </Sheet>
  );
}
