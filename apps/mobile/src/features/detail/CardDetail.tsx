import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { engram, useLiveQuery } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';
import { Content, openOriginal } from './content';
import { MetaBar } from './MetaBar';
import NoteEditor from '../../../app/note/[id]';

// One card: header (close / Original), type-specific content, floating meta bar.
export function CardDetail({ id, active, onDismiss }: { id: string; active: boolean; onDismiss: () => void }) {
  const { c, space } = useTheme();
  const insets = useSafeAreaInsets();
  const item = useLiveQuery((e) => e.db.items.get(id), [id]);
  const [showText, setShowText] = useState(false);
  useEffect(() => { if (active) engram().db.items.opened(id); }, [id, active]);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text color="text2">This card was let go.</Text>
      </View>
    );
  }
  if (item.type === 'note') return <NoteEditor id={item.id} />; // the editor is the note's detail view
  // One accent element per screen: Original only where the reader replaces the page; images get the OCR toggle here.
  const right = item.type === 'article' && item.url ? (
    <Pressable accessibilityRole="button" onPress={() => openOriginal(item.url)} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2] }}>
      <Text size="sm" weight={500} color="accent">Original</Text>
    </Pressable>
  ) : item.type === 'image' && item.ocr_text ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Show recognised text" accessibilityState={{ selected: showText }} onPress={() => setShowText((v) => !v)} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2] }}>
      <Text size="xs" weight={500} color={showText ? 'accent' : 'text2'}>Text</Text>
    </Pressable>
  ) : null;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[2] }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onDismiss} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text size="lg" color="text2">✕</Text>
        </Pressable>
        {right}
      </View>
      <Content key={item.id} item={item} showText={showText} />
      <MetaBar item={item} onDismiss={onDismiss} />
    </View>
  );
}
