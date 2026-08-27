import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { extract, type Item } from '@engram/core';
import { Trace } from '../../icons/Icon';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';
import { textDefaults } from '../../ui/Text';
import type { AskState } from './useAsk';

// The answer sits above the results as one card: a breathing trace while the model works, then the text with
// [n] citations as accent chips that open the card, the cards it drew on, and a follow-up field.

function Thinking({ label }: { label: string }) {
  const { c } = useTheme();
  const o = useSharedValue(0.35);
  useEffect(() => { o.value = withRepeat(withTiming(1, { duration: 700 }), -1, true); }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 }}>
      <Animated.View style={style}><Trace size={16} color={c.accent} /></Animated.View>
      <Text size="sm" color="text2">{label}</Text>
    </View>
  );
}

// "text [1] more [2]" -> runs of text with pressable chips for each citation that points at a real card.
function Answer({ text, cards, onOpen }: { text: string; cards: Item[]; onOpen: (id: string) => void }) {
  const { c } = useTheme();
  const parts = text.split(/(\[\d{1,2}\])/g);
  return (
    <Text size="md" lineHeight="body" selectable>
      {parts.map((p, i) => {
        const m = /^\[(\d{1,2})\]$/.exec(p);
        const card = m ? cards[Number(m[1]) - 1] : undefined;
        if (!card) return p;
        return (
          <Text key={i} size="xs" weight={600} accessibilityRole="link" accessibilityLabel={`Open ${card.title ?? 'card'}`} onPress={() => onOpen(card.id)}
            style={{ color: c.accent, backgroundColor: c.accentSoft, borderRadius: 4, paddingHorizontal: 4 }}>
            {' '}{m![1]}{' '}
          </Text>
        );
      })}
    </Text>
  );
}

export function AskCard({ state, providerName, onDevice, onAsk, onOpen }: { state: AskState; providerName: string; onDevice: boolean; onAsk: (q: string) => void; onOpen: (id: string) => void }) {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const [follow, setFollow] = useState('');
  const open = (id: string) => { onOpen(id); router.push(`/card/${id}`); };
  if (state.status === 'idle') return null;
  const cited = state.cited.map((i) => state.cards[i]).filter((x): x is Item => !!x);
  const shown = cited.length ? cited : state.cards.slice(0, 4);
  return (
    <Animated.View entering={FadeInDown.duration(200)} style={{ marginHorizontal: space[4], marginBottom: space[4], padding: space[4], gap: space[3], borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
      <Text size="xs" mono color="text3" numberOfLines={2}>{state.question}</Text>
      {state.status === 'thinking' ? (
        <Thinking label={onDevice ? 'Reading your cards on this device… this takes a while' : 'Reading your cards…'} />
      ) : state.status === 'error' ? (
        <Text size="sm" color="danger">{`Couldn't ask ${providerName}: ${state.error ?? 'unknown error'}`}</Text>
      ) : (
        <Animated.View entering={FadeIn.duration(160)} style={{ gap: space[3] }}>
          <Answer text={state.answer} cards={state.cards} onOpen={open} />
          {shown.length ? (
            <View style={{ gap: 6 }}>
              <Text size="xs" mono color="text3">{cited.length ? 'from these cards' : 'closest cards'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {shown.map((card, i) => (
                  <Pressable key={card.id} accessibilityRole="button" onPress={() => open(card.id)} style={({ pressed }) => ({ maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: c.line, backgroundColor: pressed ? c.surface2 : c.bg, flexDirection: 'row', alignItems: 'center', gap: 6 })}>
                    {cited.length ? <Text size="xs" weight={600} color="accent">{state.cards.indexOf(card) + 1}</Text> : null}
                    <Text size="xs" numberOfLines={1} style={{ flexShrink: 1 }}>{card.title ?? (card.url ? extract.shortUrl(card.url) : 'Untitled')}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], borderTopWidth: 1, borderTopColor: c.line, paddingTop: space[3] }}>
            <TextInput allowFontScaling={textDefaults.allowFontScaling} maxFontSizeMultiplier={textDefaults.maxMultiplier}
              value={follow}
              onChangeText={setFollow}
              onSubmitEditing={() => { if (follow.trim()) { onAsk(follow); setFollow(''); } }}
              placeholder="Follow up…"
              placeholderTextColor={c.text3}
              returnKeyType="send"
              accessibilityLabel="Follow-up question"
              style={{ flex: 1, minHeight: 36, paddingVertical: 0, fontFamily: 'Geist', fontSize: 15, color: c.text }}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Ask" disabled={!follow.trim()} onPress={() => { onAsk(follow); setFollow(''); }} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: space[2], opacity: follow.trim() ? 1 : 0.4 }}>
              <Text size="sm" weight={500} color="accent">Ask</Text>
            </Pressable>
          </View>
          <Text size="xs" color="text3">{onDevice ? 'Answered on this device. Nothing was sent anywhere.' : `Matching cards were sent to ${providerName} to answer this.`}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}
