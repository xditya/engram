import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, Text, useKeyboardHeight } from '../../src/ui';
import { engram } from '../../src/lib/engram';
import { useTheme } from '../../src/theme/useTheme';

const FONT = 17;
const LINE = Math.round(FONT * 1.55);

// Focus-mode editor: text, Done, tags. Saves debounced; a new note becomes an item on the first pause.
// Also mounted by the card detail for notes, so there is one editor; `id` then comes as a prop.
export default function NoteEditor({ id }: { id?: string } = {}) {
  const { c, space, font } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: route } = useLocalSearchParams<{ id: string }>();
  const param = id ?? route;
  const idRef = useRef<string | null>(param === 'new' || !param ? null : param);
  const kb = useKeyboardHeight(); // edge-to-edge window never resizes for the keyboard, so the tag row lifts itself
  const e = engram();
  const initial = idRef.current ? e.db.items.get(idRef.current) : undefined;
  const [text, setText] = useState(initial?.body ?? '');
  const [tags, setTags] = useState<string[]>(() => (idRef.current ? e.db.tags.of(idRef.current) : []));
  const [tagDraft, setTagDraft] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<TextInput>(null);

  const persist = (body: string, t: string[]) => {
    const trimmed = body.trim();
    if (!idRef.current) {
      if (!trimmed) return;
      idRef.current = e.capture.saveNote(trimmed, { tags: t }).id;
      return;
    }
    e.db.items.update(idRef.current, { body: trimmed, title: trimmed.split('\n')[0]!.replace(/^#+\s*/, '').slice(0, 80) || null });
    e.db.tags.set(idRef.current, t);
  };
  const schedule = (body: string, t: string[]) => { clearTimeout(timer.current); timer.current = setTimeout(() => persist(body, t), 600); };
  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (next: string) => {
    // Enter after "- [ ] " / "- " / "1. " continues the list; Enter on an empty marker ends it.
    if (next.length > text.length && next.endsWith('\n') && next.slice(0, -1) === text) {
      const line = text.slice(text.lastIndexOf('\n') + 1);
      const m = /^(\s*)(- \[[ x]\] |- |\d+\. )(.*)$/.exec(line);
      if (m) {
        if (!m[3]!.trim()) next = text.slice(0, text.length - line.length);
        else next += m[1]! + (m[2]!.startsWith('- [') ? '- [ ] ' : /^\d/.test(m[2]!) ? `${parseInt(m[2]!, 10) + 1}. ` : m[2]!);
      }
    }
    setText(next);
    schedule(next, tags);
  };
  const toggleTodo = (lineIdx: number) => {
    const lines = text.split('\n');
    lines[lineIdx] = lines[lineIdx]!.replace(/^(\s*- \[)([ x])(\])/, (_, a: string, s: string, b: string) => `${a}${s === ' ' ? 'x' : ' '}${b}`);
    onChange(lines.join('\n'));
  };
  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, '').toLowerCase();
    setTagDraft('');
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next);
    schedule(text, next);
  };
  const removeTag = (t: string) => { const next = tags.filter((x) => x !== t); setTags(next); schedule(text, next); };
  const done = () => { clearTimeout(timer.current); persist(text, tags); router.back(); };

  // Markdown rendered lightly inside the input: headings heavier, todo markers muted, done lines struck.
  const lines = text.split('\n');
  const styled = lines.map((line, i) => {
    const h = /^(#{1,3})\s/.exec(line);
    const todo = /^(\s*- \[)([ x])(\] )(.*)$/.exec(line);
    const nl = i < lines.length - 1 ? '\n' : '';
    if (h) return <Text key={i} style={{ fontFamily: 'Geist-SemiBold', fontSize: FONT + (4 - h[1]!.length) * 2, lineHeight: LINE + 6 }}>{line}{nl}</Text>;
    if (todo) {
      const checked = todo[2] === 'x';
      return (
        <Text key={i} style={{ fontFamily: 'Geist', fontSize: FONT, lineHeight: LINE }}>
          <Text style={{ color: c.text3, fontFamily: 'GeistMono', fontSize: FONT }} onPress={() => toggleTodo(i)}>{todo[1]}{todo[2]}{todo[3]}</Text>
          <Text style={{ fontSize: FONT, color: checked ? c.text3 : c.text, textDecorationLine: checked ? 'line-through' : 'none' }}>{todo[4]}</Text>
          {nl}
        </Text>
      );
    }
    return line + nl;
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top + space[2], paddingHorizontal: space[4], height: insets.top + 52, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" onPress={done} hitSlop={12} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2] }}>
          <Text weight={500} color="accent">Done</Text>
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[5] }}>
        <Pressable style={{ flex: 1 }} onPress={() => input.current?.focus()}>
          <TextInput
            ref={input}
            multiline
            autoFocus={!idRef.current}
            scrollEnabled={false}
            onChangeText={onChange}
            placeholder="Start typing"
            placeholderTextColor={c.text3}
            accessibilityLabel="Note"
            style={{ fontFamily: font.sans, fontSize: FONT, lineHeight: LINE, color: c.text, minHeight: LINE * 4, paddingVertical: space[3], textAlignVertical: 'top' }}
          >
            {styled}
          </TextInput>
        </Pressable>
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: kb ? kb + space[2] : Math.max(insets.bottom, space[3]) }}>
        {tags.map((t) => <Chip key={t} label={t} mono onPress={() => removeTag(t)} />)}
        <TextInput
          value={tagDraft}
          onChangeText={setTagDraft}
          onSubmitEditing={addTag}
          onBlur={addTag}
          submitBehavior="submit"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Add tag"
          placeholderTextColor={c.text3}
          accessibilityLabel="Add tag"
          style={{ minHeight: 44, minWidth: 96, flexGrow: 1, fontFamily: font.mono, fontSize: 14, color: c.text }}
        />
      </View>
    </View>
  );
}
