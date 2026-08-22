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
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: space[4], paddingRight: space[1], minHeight: 44, gap: space[2] }}>
      <Trace size={14} opacity={0.4} />
      <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
        <Text size="sm" color="text2">
          <Text size="sm" mono color="text2">{faint}</Text> faint traces · <Text size="sm" weight={500} color="text">Resurface</Text>
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={dismiss} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text size="md" color="text3">{'✕'}</Text>
      </Pressable>
    </View>
  );
}
