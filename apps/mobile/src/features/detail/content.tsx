import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import type { FileRole, Item } from '@engram/core';
import { engram, useLiveQuery } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Button, Text } from '../../ui';
import { metaOf, readingMinutes } from './format';

export const openOriginal = (url: string | null) => { if (url) void WebBrowser.openBrowserAsync(url); };

// Picks the first role that exists on disk for this item.
function useFile(item: Item, roles: FileRole[]) {
  const f = useLiveQuery((e) => {
    const rows = e.db.files.of(item.id);
    for (const role of roles) { const r = rows.find((x) => x.role === role); if (r) return r; }
    return undefined;
  }, [item.id, roles.join()]);
  return f ? { uri: engram().platform.files.path(f.hash), w: f.w, h: f.h } : undefined;
}

function Reader({ item }: { item: Item }) {
  const { space } = useTheme();
  const domain = item.domain ?? '';
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: 120, maxWidth: 680, alignSelf: 'center', width: '100%' }}>
      <Text size="xxl" weight={600} style={{ fontSize: 26 }} accessibilityRole="header">{item.title ?? domain}</Text>
      <Text size="xs" mono color="text3" style={{ marginTop: space[2] }}>{domain} · {readingMinutes(item.body)} min</Text>
      {item.body ? (
        <Text lineHeight="reader" style={{ fontSize: 17, marginTop: space[5] }}>{item.body}</Text>
      ) : (
        <View style={{ marginTop: space[5], gap: space[3] }}>
          {item.summary ? <Text lineHeight="reader" style={{ fontSize: 17 }}>{item.summary}</Text> : null}
          <Text size="sm" color="text2">
            Only the preview could be saved. <Text size="sm" color="accent" onPress={() => openOriginal(item.url)}>Open original.</Text>
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function Photo({ item }: { item: Item }) {
  const { c, space } = useTheme();
  const { width } = useWindowDimensions();
  const file = useFile(item, ['original', 'thumb']);
  const [showText, setShowText] = useState(false);
  const ratio = file?.w && file?.h ? file.w / file.h : 1;
  return (
    <View style={{ flex: 1 }}>
      {/* ponytail: ScrollView pinch-zoom is iOS-only; use react-native-zoom-toolkit when Android zoom matters */}
      <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        {file ? <Image source={{ uri: file.uri }} contentFit="contain" style={{ width, height: width / ratio }} accessibilityLabel={item.title ?? 'Image'} /> : null}
      </ScrollView>
      {showText ? (
        <ScrollView style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.bg }} contentContainerStyle={{ padding: space[5], paddingTop: 64, paddingBottom: 120 }}>
          <Text lineHeight="reader" selectable>{item.ocr_text}</Text>
        </ScrollView>
      ) : null}
      {item.ocr_text ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show recognised text"
          accessibilityState={{ selected: showText }}
          onPress={() => setShowText((v) => !v)}
          style={{ position: 'absolute', top: space[2], right: space[4], minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space[3], borderRadius: 7, backgroundColor: showText ? c.accentSoft : c.surface, borderWidth: showText ? 0 : 1, borderColor: c.line }}
        >
          <Text size="sm" weight={500} color={showText ? 'accent' : 'text2'}>Text</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const CHECK = /^(\s*[-*]\s+\[)([ xX])(\]\s.*)$/;

function Note({ item }: { item: Item }) {
  const { c, space } = useTheme();
  const [text, setText] = useState(item.body ?? '');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const save = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => engram().db.items.update(item.id, { body: next }), 400);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const lines = text.split('\n');
  const tasks = lines.flatMap((l, i) => { const m = CHECK.exec(l); return m ? [{ i, done: m[2] !== ' ', label: m[3]!.slice(2) }] : []; });
  const toggle = (i: number) => save(lines.map((l, j) => (j === i ? l.replace(CHECK, (_, a, x, b) => `${a}${x === ' ' ? 'x' : ' '}${b}`) : l)).join('\n'));
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space[5], paddingBottom: 120 }}>
      <TextInput
        multiline
        value={text}
        onChangeText={save}
        placeholder="Write"
        placeholderTextColor={c.text3}
        accessibilityLabel="Note"
        style={{ fontFamily: 'Geist', fontSize: 17, lineHeight: 26, color: c.text, minHeight: 200, textAlignVertical: 'top' }}
      />
      {tasks.length ? (
        <View style={{ marginTop: space[4], gap: space[1] }}>
          {tasks.map(({ i, done, label }) => (
            <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: done }} onPress={() => toggle(i)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space[3] }}>
              <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: done ? c.accent : c.line, backgroundColor: done ? c.accent : 'transparent' }} />
              <Text size="sm" color={done ? 'text3' : 'text'} style={{ textDecorationLine: done ? 'line-through' : 'none' }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Quote({ item }: { item: Item }) {
  const { space } = useTheme();
  const body = item.body ?? item.title ?? '';
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[6], paddingTop: '18%', paddingBottom: 120, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', paddingLeft: 14 }}>
        <Text size="xl" weight={500} style={{ fontSize: 24, lineHeight: 32, marginLeft: -14, width: 14 }}>{'“'}</Text>
        <Text size="xl" weight={500} style={{ fontSize: 24, lineHeight: 32, textAlign: 'center', flexShrink: 1 }}>{body}{'”'}</Text>
      </View>
      {item.title && item.body ? <Text size="sm" color="text2" style={{ marginTop: space[4], textAlign: 'center' }}>{item.title}</Text> : null}
      {item.domain ? <Text size="xs" mono color="accent" onPress={() => openOriginal(item.url)} style={{ marginTop: space[2] }}>{item.domain}</Text> : null}
    </ScrollView>
  );
}

// link / product / video / pdf / everything else: preview, title, description, one Open.
function Preview({ item }: { item: Item }) {
  const { c, space } = useTheme();
  const { width } = useWindowDimensions();
  const poster = useFile(item, ['poster', 'thumb']);
  const meta = metaOf(item);
  const ratio = poster?.w && poster?.h ? poster.w / poster.h : 16 / 9;
  const sub = [item.domain, item.type === 'video' && meta.duration, item.type === 'pdf' && meta.pages && `${meta.pages} pages`].filter(Boolean).join(' · ');
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
      {poster ? <Image source={{ uri: poster.uri }} contentFit="cover" style={{ width, height: Math.min(width / ratio, 360), backgroundColor: c.surface2 }} /> : null}
      <View style={{ padding: space[5], gap: space[3] }}>
        <Text size="xl" weight={600} accessibilityRole="header">{item.title ?? item.url}</Text>
        {sub ? <Text size="xs" mono color="text3">{sub}</Text> : null}
        {item.type === 'product' && meta.price ? (
          <View>
            <Text size="lg" mono weight={500}>{meta.currency ? `${meta.currency} ` : ''}{meta.price}</Text>
            <Text size="xs" mono color="text3">price when saved</Text>
          </View>
        ) : null}
        {item.summary ? <Text lineHeight="reader" color="text2">{item.summary}</Text> : null}
        {item.body && item.type === 'video' ? <Text size="sm" lineHeight="reader" color="text2">{item.body}</Text> : null}
        {item.url ? <Button title="Open" onPress={() => openOriginal(item.url)} style={{ marginTop: space[2] }} /> : null}
      </View>
    </ScrollView>
  );
}

export function Content({ item }: { item: Item }) {
  switch (item.type) {
    case 'article': return <Reader item={item} />;
    case 'image': return <Photo item={item} />;
    case 'note': return <Note item={item} />;
    case 'quote': return <Quote item={item} />;
    default: return <Preview item={item} />;
  }
}
