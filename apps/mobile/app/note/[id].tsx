import { useEffect, useRef, useState } from 'react';
import { textDefaults } from '../../src/ui/Text';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notes } from '@engram/core';
import { Chip, HelpTip, Text, useKeyboardHeight } from '../../src/ui';
import { engram, useToast } from '../../src/lib/engram';
import { useTheme } from '../../src/theme/useTheme';
import { Markdown, blockRange } from '../../src/features/detail/Markdown';
import { tidyNote } from '../../src/features/detail/tidy';

const FONT = 17;
const LINE = Math.round(FONT * 1.55);

// Focus-mode editor: text, Done, tags. Saves debounced; a new note becomes an item on the first pause.
// Also mounted by the card detail for notes, so there is one editor; `id` then comes as a prop.
// Two views of the same text: Raw (the input) and Formatted (markdown, checkboxes tick in place). Notes that
// already carry structure open formatted; plain lists get an offer to be tidied.
export default function NoteEditor({ id }: { id?: string } = {}) {
  const { c, space, font } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const show = useToast((s) => s.show);
  const { id: route } = useLocalSearchParams<{ id: string }>();
  const param = id ?? route;
  const idRef = useRef<string | null>(param === 'new' || !param ? null : param);
  const kb = useKeyboardHeight(); // edge-to-edge window never resizes for the keyboard, so the tag row lifts itself
  const e = engram();
  const initial = idRef.current ? e.db.items.get(idRef.current) : undefined;
  const [text, setText] = useState(initial?.body ?? '');
  const [tags, setTags] = useState<string[]>(() => (idRef.current ? e.db.tags.of(idRef.current) : []));
  const [tagDraft, setTagDraft] = useState('');
  const [formatted, setFormatted] = useState(() => !!initial?.body && notes.looksLikeMarkdown(initial.body));
  const [tidying, setTidying] = useState(false);
  // Formatted view edits one block at a time: the tapped block becomes an input with its raw lines.
  const [edit, setEdit] = useState<{ start: number; end: number; draft: string } | null>(null);
  const lineInput = useRef<TextInput>(null);
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
  const replace = (next: string) => { setText(next); clearTimeout(timer.current); persist(next, tags); };
  const toggleTodo = (line: number) => replace(notes.toggleTodoLine(text, line));
  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, '').toLowerCase();
    setTagDraft('');
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next);
    schedule(text, next);
  };
  const removeTag = (t: string) => { const next = tags.filter((x) => x !== t); setTags(next); schedule(text, next); };

  const startEdit = (line: number, source = text) => {
    const [start, end] = blockRange(source, line);
    setEdit({ start, end, draft: source.split('\n').slice(start, end).join('\n') });
  };
  // Continuation marker for a new line after `line`, the same rule the raw editor uses on Enter.
  const nextMarker = (line: string) => {
    const m = /^(\s*)(- \[[ x]\] |- |\d+\. )/.exec(line);
    return m ? m[1]! + (m[2]!.startsWith('- [') ? '- [ ] ' : /^\d/.test(m[2]!) ? `${parseInt(m[2]!, 10) + 1}. ` : m[2]!) : '';
  };
  const commitEdit = (andContinue = false) => {
    if (!edit) return;
    const lines = text.split('\n');
    const draft = edit.draft.replace(/\s+$/, '');
    const marker = nextMarker(draft.split('\n').at(-1) ?? '');
    // An empty marker line on Return ends the list instead of adding another.
    const drop = andContinue && draft.trim() !== '' && /^\s*(- \[[ x]\] |- |\d+\. )$/.test(draft);
    const insert = drop ? [] : draft.split('\n');
    lines.splice(edit.start, edit.end - edit.start, ...insert);
    const next = lines.join('\n');
    replace(next);
    if (andContinue && !drop) {
      const at = edit.start + insert.length;
      const withNew = [...lines.slice(0, at), marker, ...lines.slice(at)].join('\n');
      setText(withNew);
      setEdit({ start: at, end: at + 1, draft: marker });
    } else setEdit(null);
  };
  const editAtEnd = () => {
    const lines = text.split('\n');
    const marker = nextMarker(lines.at(-1) ?? '');
    const withNew = text ? `${text}\n${marker}` : marker;
    setText(withNew);
    setEdit({ start: lines.length, end: lines.length + 1, draft: marker });
  };

  // Tidy: the model when a provider is set up, a plain checklist otherwise. The old text stays one tap away.
  const tidy = async () => {
    const before = text;
    setTidying(true);
    try {
      const { text: next, by } = await tidyNote(before);
      if (next.trim() === before.trim()) { show('Already tidy'); return; }
      replace(next);
      setFormatted(true);
      show(by === 'model' ? 'Prettified' : 'Made it a checklist', 6000, { label: 'Undo', onPress: () => { replace(before); setFormatted(false); } });
    } catch (err) { show(`Couldn't prettify: ${(err as Error).message}`); }
    finally { setTidying(false); }
  };
  const done = () => {
    clearTimeout(timer.current);
    persist(text, tags);
    // Leaving a plain list behind: offer once; the note is already saved either way.
    if (!formatted && notes.looksTidyable(text)) show('Make this a checklist?', 6000, { label: 'Prettify', onPress: () => void tidy() });
    router.back();
  };

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

  const canFormat = notes.looksLikeMarkdown(text);
  const headerBtn = (label: string, onPress: () => void, opts: { accent?: boolean; disabled?: boolean } = {}) => (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={opts.disabled} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2], opacity: opts.disabled ? 0.4 : 1 }}>
      <Text size="sm" weight={500} color={opts.accent ? 'accent' : 'text2'}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top + space[2], paddingHorizontal: space[3], height: insets.top + 52, flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
        {text.trim() ? headerBtn(tidying ? 'Prettifying…' : 'Prettify', () => void tidy(), { disabled: tidying }) : null}
        <HelpTip title="Writing a note" lines={[
          ['Prettify', 'Turns a plain list into a checklist with a title, without changing your words. Uses your Intelligence provider when one is set up. Undo is one tap.'],
          ['Formatted', 'Shows the note with headings, bullets and checkboxes. Tap a line to edit just that line; tap below the text to add one.'],
          ['Raw', 'The plain text behind it. Markdown works: # heading, - bullet, - [ ] to do, **bold**.'],
          ['Checkbox', 'Tap to tick it off. Done items are struck through.'],
          'Enter after a list line continues the list; Enter on an empty item ends it.',
        ]} />
        <View style={{ flex: 1 }} />
        {canFormat ? headerBtn(formatted ? 'Raw' : 'Formatted', () => setFormatted((v) => !v)) : null}
        {headerBtn('Done', done, { accent: true })}
      </View>
      {formatted ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[5], paddingVertical: space[3] }}>
          <Markdown
            text={text}
            onToggle={(line) => { if (!edit) toggleTodo(line); }}
            onPressBlock={(line) => { if (edit) commitEdit(); startEdit(line); }}
            editor={edit ? { line: edit.start, node: (
              <TextInput allowFontScaling={textDefaults.allowFontScaling} maxFontSizeMultiplier={textDefaults.maxMultiplier}
                ref={lineInput}
                autoFocus
                multiline
                value={edit.draft}
                onChangeText={(d) => setEdit((cur) => (cur ? { ...cur, draft: d } : cur))}
                onSubmitEditing={() => commitEdit(true)}
                onBlur={() => commitEdit()}
                submitBehavior="submit"
                accessibilityLabel="Edit line"
                style={{ fontFamily: font.sans, fontSize: FONT, lineHeight: LINE, color: c.text, paddingVertical: 2, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 6, backgroundColor: c.surface2 }}
              />
            ) } : null}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Add a line" onPress={() => { if (edit) commitEdit(); editAtEnd(); }} style={{ flex: 1, minHeight: 80 }} />
        </ScrollView>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[5] }}>
          <Pressable style={{ flex: 1 }} onPress={() => input.current?.focus()}>
            <TextInput allowFontScaling={textDefaults.allowFontScaling} maxFontSizeMultiplier={textDefaults.maxMultiplier}
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
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: kb ? kb + space[2] : Math.max(insets.bottom, space[3]) }}>
        {tags.map((t) => <Chip key={t} label={t} mono onPress={() => removeTag(t)} />)}
        <TextInput allowFontScaling={textDefaults.allowFontScaling} maxFontSizeMultiplier={textDefaults.maxMultiplier}
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
