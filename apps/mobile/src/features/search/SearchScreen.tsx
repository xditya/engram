import { useMemo, useState } from 'react';
import { textDefaults } from '../../ui/Text';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ai, search as core } from '@engram/core';
import { engram, useEngram, useToast } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Hairline, HelpTip, Screen, Text } from '../../ui';
import { useRecent } from './recent';
import { ItemGrid, toEntry } from '../spaces/ItemGrid';
import { useSearch } from './useSearch';
import { AskCard } from './AskCard';
import { askProvider, useAsk, useRetrieve } from './useAsk';

const OPERATORS = ['type:', 'tag:', 'site:', 'text:', 'before:', 'after:', 'color:', 'is:pinned', 'in:', '-exclude', '"exact"'];
// Fixed value sets; tags and sites come from core suggest.
const VALUES: Record<string, string[]> = { type: ['article', 'image', 'note', 'quote', 'pdf', 'video', 'product'], is: ['pinned', 'trash'], has: ['note'] };

function OpChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={{ minHeight: 32, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 7 }}>
      <Text size="xs" mono>{label}</Text>
    </Pressable>
  );
}

export function SearchScreen() {
  const { c, space } = useTheme();
  const router = useRouter();
  const { engram: e } = useEngram();
  const toast = useToast((s) => s.show);
  const recent = useRecent();
  // Opened with ?q=tag:x (tapping a tag on a card) the query starts as a chip; plain words start in the field.
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [chips, setChips] = useState<string[]>(() => (q && core.tokenize(q).every((t) => t.kind === 'op') ? core.tokenize(q).map((t) => t.raw) : [])); // committed tokens, rendered inside the field
  const [text, setText] = useState(() => (q && !core.tokenize(q).every((t) => t.kind === 'op') ? q : ''));
  const query = [...chips, text].join(' ').trim();
  // A question ("which reel talks about claude code?") is searched by its keywords: FTS wants every word, and
  // "which" or "talks" would otherwise empty the results under the answer.
  const question = ai.looksLikeQuestion(query);
  const plain = useSearch(question ? '' : query);
  const retrieved = useRetrieve(query, question);
  const { hits, ms } = question ? retrieved : plain;
  // Ask mode: a question-shaped query offers an answer from the model over the matching cards, above the results.
  const asking = useAsk();
  const provider = e ? askProvider() : null; // cheap; recomputed as the on-device model loads or settings change
  const askNow = () => { if (!provider) return; recent.add(query); void asking.ask(query); };
  const askHeader = asking.state.status !== 'idle' && provider
    ? <AskCard state={asking.state} providerName={provider.name} onDevice={provider.onDevice} onAsk={(q) => void asking.ask(q)} onOpen={() => recent.add(asking.state.question)} />
    : undefined;

  // A finished operator (`type:pdf `) becomes a chip as soon as the space after it is typed.
  const onChange = (t: string) => {
    const last = core.tokenize(t).at(-1);
    if (t.endsWith(' ') && last?.kind === 'op') { setChips((cs) => [...cs, last.raw]); setText(''); } else setText(t);
  };
  const commit = () => { if (query) recent.add(query); };

  const suggestions = useMemo(() => {
    if (!e || !text) return [];
    const [op, v] = text.split(':');
    const fixed = op && v !== undefined && VALUES[op] ? VALUES[op].filter((x) => x.startsWith(v)).map((x) => `${op}:${x}`) : [];
    return [...new Set([...fixed, ...core.suggest(e.platform.db, text).map((s) => s.text)])].slice(0, 8);
  }, [e, text]);

  const saveSpace = () => {
    const s = engram().db.spaces.create(query, query);
    recent.add(query);
    toast('Saved as Space');
    router.replace({ pathname: "/spaces/[id]" as never, params: { id: s.id } });
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], marginHorizontal: space[4], marginTop: 18, marginBottom: 22 }}>
      <View style={{ flex: 1, minHeight: 48, paddingHorizontal: 14, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1.5, borderColor: c.accent }}>
        {chips.map((ch, i) => {
          const op = core.tokenize(ch)[0]?.kind === 'op';
          return (
            <Pressable key={`${ch}${i}`} accessibilityRole="button" accessibilityLabel={`Remove ${ch}`} hitSlop={8} onPress={() => setChips((cs) => cs.filter((_, j) => j !== i))}
              style={{ paddingHorizontal: 6, height: 26, justifyContent: 'center', alignSelf: 'center', borderRadius: 6, backgroundColor: op ? c.accentSoft : 'transparent' }}>
              <Text size="xs" mono color={op ? 'accent' : 'text'}>{ch}</Text>
            </Pressable>
          );
        })}
        <TextInput allowFontScaling={textDefaults.allowFontScaling} maxFontSizeMultiplier={textDefaults.maxMultiplier}
          autoFocus
          value={text}
          onChangeText={onChange}
          onSubmitEditing={() => { if (provider && query) askNow(); else commit(); }}
          onKeyPress={(ev) => { if (ev.nativeEvent.key === 'Backspace' && !text) setChips((cs) => cs.slice(0, -1)); }}
          placeholderTextColor={c.text3}
          cursorColor={c.accent}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          submitBehavior="submit"
          accessibilityLabel="Search"
          style={{ flex: 1, minWidth: 80, height: 34, paddingVertical: 0, margin: 0, textAlignVertical: 'center', includeFontPadding: false, fontFamily: 'GeistMono', fontSize: 14, lineHeight: 18, color: c.text }}
        />
        {query ? (
          <Pressable accessibilityRole="button" onPress={saveSpace} hitSlop={12} style={{ height: 34, justifyContent: 'center', alignSelf: 'center' }}>
            <Text size="xs" weight={500} color="accent">Save as Space</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}><Text size="sm" color="text2">Cancel</Text></Pressable>
      </View>

      {provider && query && asking.state.status === 'idle' ? (
        <View style={{ flexDirection: 'row', paddingHorizontal: space[4], paddingBottom: space[3] }}>
          <Pressable accessibilityRole="button" accessibilityHint={`Answers from your cards using ${provider!.name}`} onPress={askNow}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: pressed ? c.accent : c.accentSoft })}>
            <Text size="sm" weight={500} color="accent">Ask your library</Text>
            <Text size="xs" mono color="accent">↵</Text>
          </Pressable>
        </View>
      ) : suggestions.length ? (
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: space[4], gap: space[2], paddingBottom: space[3], alignItems: 'flex-start' }}>
          {suggestions.map((s) => <OpChip key={s} label={s} onPress={() => onChange(s.endsWith(':') ? s : `${s} `)} />)}
        </ScrollView>
      ) : null}

      {query || askHeader ? (
        <>
          {query ? (
            <Text size="xs" mono color="text3" style={{ paddingHorizontal: space[4], paddingBottom: space[2] }}>
              {hits.length ? `${hits.length} results · ${(ms / 1000).toFixed(2)} s` : `No results for "${query}"`}
            </Text>
          ) : null}
          <ItemGrid entries={hits.map(toEntry)} header={askHeader} onOpen={() => recent.add(query)} />
        </>
      ) : (
        <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingHorizontal: space[4], gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text size="xs" color="text3">Operators</Text>
            <HelpTip title="Search operators" lines={[
              'Type a word to search titles, text, tags and the words read from images. Add an operator to narrow it down; they combine.',
              ['type:', 'article, image, note, quote, pdf, video, product'],
              ['tag:', 'cards with that tag, e.g. tag:fonts'],
              ['site:', 'cards from a site, e.g. site:instagram.com'],
              ['text:', 'must appear in the page text, not just the title'],
              ['before: / after:', 'saved before or after a date: 2026-05-01, yesterday, last week'],
              ['color:', 'images and thumbnails with that colour'],
              ['is:pinned', 'pinned cards only; is:trash for cards you let go'],
              ['in:', 'cards inside a Space'],
              ['-word', 'leave out cards containing the word'],
              ['"exact phrase"', 'those words together, in that order'],
              'Press space after an operator and it turns into a chip. A search you want to keep can be saved as a Space.',
            ]} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {OPERATORS.map((op) => <OpChip key={op} label={op} onPress={() => setText((t) => t + op)} />)}
          </View>
          {recent.list.length ? (
            <>
              <Text size="xs" color="text3" style={{ marginTop: 14 }}>Recent searches</Text>
              <View>
                {recent.list.map((r, i) => (
                  <View key={r}>
                    {i ? <Hairline /> : null}
                    <Pressable accessibilityRole="button" onPress={() => { setChips([]); setText(r); }} hitSlop={6} style={{ paddingVertical: 11 }}>
                      <Text size="sm" mono>{r}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
