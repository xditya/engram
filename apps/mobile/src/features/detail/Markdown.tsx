import type { ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { notes } from '@engram/core';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';

// Read view for notes: the markdown subset core understands, drawn with the app's type. Checkboxes toggle
// through `onToggle(line)`; tapping a block's text calls `onPressBlock(line)`, and the caller may hand back an
// `editor` for that line, which is drawn in the block's place so one line is edited while the rest stay set.
const FONT = 17;
const LINE = Math.round(FONT * 1.55);

function Inline({ parts, muted }: { parts: notes.Inline[]; muted?: boolean }) {
  const { c, font } = useTheme();
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'bold') return <Text key={i} style={{ fontFamily: 'Geist-SemiBold', fontSize: FONT, lineHeight: LINE }}>{p.text}</Text>;
        if (p.kind === 'italic') return <Text key={i} style={{ fontStyle: 'italic', fontSize: FONT, lineHeight: LINE }}>{p.text}</Text>;
        if (p.kind === 'code') return <Text key={i} style={{ fontFamily: font.mono, fontSize: FONT - 2, lineHeight: LINE, backgroundColor: c.surface2, borderRadius: 4 }}>{p.text}</Text>;
        if (p.kind === 'link') return <Text key={i} accessibilityRole="link" onPress={() => void Linking.openURL(p.href)} style={{ color: c.accent, fontSize: FONT, lineHeight: LINE }}>{p.text}</Text>;
        return <Text key={i} style={{ fontSize: FONT, lineHeight: LINE, color: muted ? c.text3 : c.text }}>{p.text}</Text>;
      })}
    </>
  );
}

export function Markdown({ text, onToggle, onPressBlock, editor }: { text: string; onToggle?: (line: number) => void; onPressBlock?: (line: number) => void; editor?: { line: number; node: ReactNode } | null }) {
  const { c, space } = useTheme();
  const blocks = notes.parseMarkdown(text);
  const press = (line: number) => (onPressBlock ? () => onPressBlock(line) : undefined);
  return (
    <View style={{ gap: 6 }}>
      {blocks.map((b, i) => {
        if (editor && editor.line === b.line) return <View key={`e${i}`}>{editor.node}</View>;
        const indent = 'depth' in b ? b.depth * 18 : 0;
        switch (b.kind) {
          case 'heading': {
            const size = b.level === 1 ? 26 : b.level === 2 ? 21 : 18;
            return <Text key={i} onPress={press(b.line)} style={{ fontFamily: 'Geist-SemiBold', fontSize: size, lineHeight: Math.round(size * 1.25), marginTop: i ? space[3] : 0, marginBottom: 2 }}><Inline parts={b.inline} /></Text>;
          }
          case 'rule':
            return <Pressable key={i} onPress={press(b.line)} style={{ height: 1, backgroundColor: c.line, marginVertical: space[2] }} />;
          case 'quote':
            return (
              <Pressable key={i} onPress={press(b.line)} style={{ borderLeftWidth: 2, borderLeftColor: c.line, paddingLeft: space[3] }}>
                <Text style={{ fontSize: FONT, lineHeight: LINE, color: c.text2 }}><Inline parts={b.inline} muted /></Text>
              </Pressable>
            );
          case 'todo':
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginLeft: indent, paddingVertical: 2 }}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: b.checked }} onPress={onToggle ? () => onToggle(b.line) : undefined} hitSlop={8}
                  style={{ width: 20, height: 20, marginTop: (LINE - 20) / 2, borderRadius: 6, borderWidth: 1.5, borderColor: b.checked ? c.accent : c.text3, backgroundColor: b.checked ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {b.checked ? <View style={{ width: 9, height: 5, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: c.bg, transform: [{ rotate: '-45deg' }], marginTop: -2 }} /> : null}
                </Pressable>
                <Text onPress={press(b.line)} style={{ flex: 1, fontSize: FONT, lineHeight: LINE, textDecorationLine: b.checked ? 'line-through' : 'none' }}><Inline parts={b.inline} muted={b.checked} /></Text>
              </View>
            );
          case 'bullet':
          case 'number':
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 10, marginLeft: indent }}>
                <Text style={{ width: b.kind === 'number' ? 22 : 14, fontSize: FONT, lineHeight: LINE, color: c.text3, textAlign: b.kind === 'number' ? 'right' : 'center' }}>{b.kind === 'number' ? `${b.n}.` : '•'}</Text>
                <Text onPress={press(b.line)} style={{ flex: 1, fontSize: FONT, lineHeight: LINE }}><Inline parts={b.inline} /></Text>
              </View>
            );
          default:
            return <Text key={i} onPress={press(b.line)} style={{ fontSize: FONT, lineHeight: LINE }}><Inline parts={b.inline} /></Text>;
        }
      })}
    </View>
  );
}

// The source lines a block covers: its own line through the line before the next block (paragraphs wrap).
export function blockRange(text: string, line: number): [number, number] {
  const blocks = notes.parseMarkdown(text);
  const i = blocks.findIndex((b) => b.line === line);
  if (i < 0) return [line, line + 1];
  const lines = text.split('\n');
  let end = i + 1 < blocks.length ? blocks[i + 1]!.line : lines.length;
  while (end > line + 1 && !lines[end - 1]!.trim()) end--;
  return [line, end];
}
