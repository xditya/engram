import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { search as core } from '@engram/core';
import { engram, useEngram, useToast } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Hairline, Screen, Text } from '../../ui';
import { useRecent } from './recent';
import { ResultRow } from './ResultRow';
import { useSearch } from './useSearch';

const OPERATORS = ['type:', 'tag:', 'site:', 'text:', 'before:', 'after:', 'color:', 'is:pinned', 'in:', '-exclude', '"exact"'];
// Fixed value sets; tags and sites come from core suggest.
const VALUES: Record<string, string[]> = { type: ['article', 'image', 'note', 'quote', 'pdf', 'video', 'product'], is: ['pinned', 'trash'], has: ['note'] };

function OpChip({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={{ minHeight: 32, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 7 }}>
      <Text size="xs" mono color="text2" style={{ fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function SearchScreen() {
  const { c, space } = useTheme();
  const router = useRouter();
  const { engram: e } = useEngram();
  const toast = useToast((s) => s.show);
  const recent = useRecent();
  const [chips, setChips] = useState<string[]>([]); // committed tokens, rendered inside the field
  const [text, setText] = useState('');
  const query = [...chips, text].join(' ').trim();
  const { hits, ms } = useSearch(query);

  // A finished operator (`type:pdf `) becomes a chip as soon as the space after it is typed.
  const onChange = (t: string) => {
    const last = core.tokenize(t).at(-1);
    if (t.endsWith(' ') && last?.kind === 'op') { setChips((cs) => [...cs, last.raw]); setText(''); } else setText(t);
  };
  const commit = () => {
    if (text.trim()) { setChips((cs) => [...cs, text.trim()]); setText(''); }
    if (query) recent.add(query);
  };

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
      <View style={{ margin: space[4], minHeight: 48, paddingHorizontal: space[3], paddingVertical: 6, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1.5, borderColor: c.accent }}>
        {chips.map((ch, i) => {
          const op = core.tokenize(ch)[0]?.kind === 'op';
          return (
            <Pressable key={`${ch}${i}`} accessibilityRole="button" accessibilityLabel={`Remove ${ch}`} hitSlop={8} onPress={() => setChips((cs) => cs.filter((_, j) => j !== i))}
              style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: op ? c.accentSoft : 'transparent' }}>
              <Text size="xs" mono style={{ fontSize: 13 }} color={op ? 'accent' : 'text'}>{ch}</Text>
            </Pressable>
          );
        })}
        <TextInput
          autoFocus
          value={text}
          onChangeText={onChange}
          onSubmitEditing={commit}
          onKeyPress={(ev) => { if (ev.nativeEvent.key === 'Backspace' && !text) setChips((cs) => cs.slice(0, -1)); }}
          placeholder={chips.length ? '' : 'Search'}
          placeholderTextColor={c.text3}
          cursorColor={c.accent}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          submitBehavior="submit"
          accessibilityLabel="Search"
          style={{ flex: 1, minWidth: 80, paddingVertical: 4, fontFamily: 'GeistMono', fontSize: 14, color: c.text }}
        />
        {query ? (
          <Pressable accessibilityRole="button" onPress={saveSpace} hitSlop={12} style={{ minHeight: 32, justifyContent: 'center' }}>
            <Text size="xs" weight={500} color="accent">Save as Space</Text>
          </Pressable>
        ) : null}
      </View>

      {suggestions.length ? (
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], gap: space[2], paddingBottom: space[3] }}>
          {suggestions.map((s) => <OpChip key={s} label={s} onPress={() => onChange(s.endsWith(':') ? s : `${s} `)} />)}
        </ScrollView>
      ) : null}

      {query ? (
        <>
          <Text size="xs" mono color="text3" style={{ paddingHorizontal: space[4], paddingBottom: space[2] }}>
            {hits.length ? `${hits.length} results · ${(ms / 1000).toFixed(2)} s` : `No results for "${query}"`}
          </Text>
          <FlashList
            data={hits}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <ResultRow item={item} onPress={() => { recent.add(query); router.push({ pathname: "/card/[id]" as never, params: { id: item.id } }); }} />}
          />
        </>
      ) : (
        <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingHorizontal: space[4], gap: space[3] }}>
          <Text size="xs" color="text3">Operators</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {OPERATORS.map((op) => <OpChip key={op} label={op} onPress={() => setText((t) => t + op)} />)}
          </View>
          {recent.list.length ? (
            <>
              <Text size="xs" color="text3" style={{ marginTop: space[3] }}>Recent searches</Text>
              <View style={{ backgroundColor: c.surface, borderRadius: 14 }}>
                {recent.list.map((r, i) => (
                  <View key={r}>
                    {i ? <Hairline /> : null}
                    <Pressable accessibilityRole="button" onPress={() => { setChips([]); setText(r); }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[4] }}>
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
