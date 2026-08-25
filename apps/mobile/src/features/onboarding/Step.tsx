import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { goHome } from '../../lib/nav';
import { useTheme } from '../../theme/useTheme';
import { Screen, Text } from '../../ui';
import { useSettings } from '../../lib/engram';

export const STEPS = 5;

// Ends onboarding from anywhere: persist the flag and land in the Library.
export function useFinish() {
  const router = useRouter();
  const update = useSettings((s) => s.update);
  return () => { update({ onboarded: true }); goHome(); };
}

// Shared frame: 2 px determinate line on top, "Skip" top-right, scrolling body, optional pinned footer.
export function Step({ n, children, footer }: { n: number; children: ReactNode; footer?: ReactNode }) {
  const { c, space } = useTheme();
  const finish = useFinish();
  return (
    <Screen>
      <View style={{ height: 2, backgroundColor: c.surface2 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: STEPS, now: n }}>
        <View style={{ height: 2, width: `${(n / STEPS) * 100}%`, backgroundColor: c.accent }} />
      </View>
      <View style={{ height: 52, flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space[4] }}>
        <Pressable accessibilityRole="button" onPress={finish} hitSlop={8} style={{ justifyContent: 'center', minWidth: 44 }}>
          <Text size="sm" color="text2" style={{ textAlign: 'right' }}>Skip</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[5], paddingBottom: space[5], gap: space[4] }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: space[5], paddingBottom: space[4], gap: space[3] }}>{footer}</View> : null}
    </Screen>
  );
}

// Radio-style chooser card. `selected` draws the accent ring and reveals the card's own controls.
export function Card({ title, body, selected, onPress, children, disabled, badge }: {
  title: string; body: string; selected?: boolean; onPress?: () => void; children?: ReactNode; disabled?: boolean; badge?: string;
}) {
  const { c, space } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: selected ? c.accentSoft : c.surface, borderRadius: 14, padding: space[4], gap: space[2], opacity: disabled ? 0.5 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text weight={500} style={{ flex: 1 }}>{title}</Text>
        {badge ? <Text size="xs" mono color="text3">{badge}</Text> : null}
      </View>
      <Text size="sm" color="text2">{body}</Text>
      {selected ? children : null}
    </Pressable>
  );
}
