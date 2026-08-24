import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import type { FileRole, Item } from '@engram/core';
import { engram, useLiveQuery } from '../../lib/hub';
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
    <ScrollView contentContainerStyle={{ paddingHorizontal: space[5], paddingTop: space[2], paddingBottom: 120, maxWidth: 680, alignSelf: 'center', width: '100%' }}>
      <Text size="xxl" weight={600} style={{ fontSize: 26 }} accessibilityRole="header">{item.title ?? domain}</Text>
      <Text size="xs" mono color="text3" style={{ marginTop: 10 }}>{domain} · {readingMinutes(item.body)} min</Text>
      {item.body ? (
        <Text lineHeight="reader" style={{ marginTop: 22 }}>{item.body}</Text>
      ) : (
        <View style={{ marginTop: space[5], gap: space[3] }}>
          {item.summary ? <Text lineHeight="reader">{item.summary}</Text> : null}
          <Text size="sm" color="text2">
            Only the preview could be saved. <Text size="sm" color="accent" onPress={() => openOriginal(item.url)}>Open original.</Text>
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function Photo({ item, showText }: { item: Item; showText?: boolean }) {
  const { c, space } = useTheme();
  const { width } = useWindowDimensions();
  const file = useFile(item, ['original', 'thumb']);
  const sized = useFile(item, ['thumb', 'original']); // the thumb job records dimensions; the original may not carry any
  const dims = file?.w && file.h ? file : sized?.w && sized.h ? sized : undefined;
  const ratio = dims ? dims.w! / dims.h! : 1;
  return (
    <View style={{ flex: 1 }}>
      {/* ponytail: ScrollView pinch-zoom is iOS-only; use react-native-zoom-toolkit when Android zoom matters */}
      <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        {file ? <Image source={{ uri: file.uri }} contentFit="contain" style={{ width, height: width / ratio }} accessibilityLabel={item.title ?? 'Image'} /> : null}
      </ScrollView>
      {showText ? (
        <ScrollView style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.bg }} contentContainerStyle={{ padding: space[5], paddingBottom: 120 }}>
          <Text lineHeight="reader" selectable>{item.ocr_text}</Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

function Quote({ item }: { item: Item }) {
  const { space } = useTheme();
  const body = item.body ?? item.title ?? '';
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[6], paddingTop: '18%', paddingBottom: 120, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', paddingLeft: 14 }}>
        <Text size="xl" weight={500} style={{ lineHeight: 32, marginLeft: -14, width: 14 }}>{'“'}</Text>
        <Text size="xl" weight={500} style={{ lineHeight: 32, textAlign: 'center', flexShrink: 1 }}>{body}</Text>
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

export function Content({ item, showText }: { item: Item; showText?: boolean }) {
  switch (item.type) {
    case 'article': return <Reader item={item} />;
    case 'image': return <Photo item={item} showText={showText} />;
    case 'quote': return <Quote item={item} />;
    default: return <Preview item={item} />;
  }
}
