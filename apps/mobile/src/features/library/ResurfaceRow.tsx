import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { db as coreDb } from '@engram/core';
import { Trace } from '../../icons/Icon';
import { useLiveQuery } from '../../lib/engram';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';

const DAY = 86_400_000;
const stamp = () => new File(Paths.document, 'resurface-dismissed');
const dismissedToday = () => { try { const f = stamp(); return f.exists && Date.now() - Number(f.textSync()) < DAY; } catch { return false; } };

// Quiet row offered once a day once the library holds 50 or more cards.
export function ResurfaceRow({ count, onPress }: { count: number; onPress: () => void }) {
  const { c, space } = useTheme();
  const [hidden, setHidden] = useState(dismissedToday);
  const faint = useLiveQuery((e) => (count >= 50 ? coreDb.resurfaceCandidates(e.platform.db, e.platform.now()).length : 0), [count]) ?? 0;
  if (hidden || count < 50 || !faint) return null;
  const dismiss = () => { setHidden(true); try { stamp().write(String(Date.now())); } catch { /* web */ } };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[1], paddingTop: 4, paddingBottom: 10, gap: space[2] }}>
      <Trace size={14} opacity={0.4} />
      <Pressable accessibilityRole="button" onPress={onPress} hitSlop={12} style={{ flex: 1, justifyContent: 'center' }}>
        <Text size="xs" color="text2" style={{ fontSize: 13 }}>
          {faint} faint traces · <Text size="xs" weight={500} color="text" style={{ fontSize: 13 }}>Resurface</Text>
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={dismiss} hitSlop={12} style={{ justifyContent: 'center' }}>
        <Text size="xs" color="text3" style={{ fontSize: 13 }}>{'✕'}</Text>
      </Pressable>
    </View>
  );
}
