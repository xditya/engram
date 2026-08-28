import { useCallback } from 'react';
import { Platform as RN, Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useToast } from '../lib/toast';
import { useShake } from '../lib/useShake';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

// Surface card anchored above the home search bar / FAB. Both the toast and the screenshot prompt are one
// of these so they look identical; a card with no actions never intercepts taps.
export function ToastCard({ message, actions }: { message: string; actions: { label: string; onPress: () => void; muted?: boolean }[] }) {
  const { c, space, radius } = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOutDown.duration(160)} pointerEvents={actions.length ? 'auto' : 'none'} accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: space[4], paddingRight: actions.length ? space[1] : space[4], borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}>
      <Text size="sm" numberOfLines={2} style={{ flex: 1 }}>{message}</Text>
      {actions.map((a) => (
        <Pressable key={a.label} accessibilityRole="button" onPress={a.onPress} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: space[3], justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Text size="sm" weight={a.muted ? 400 : 500} color={a.muted ? 'text3' : 'accent'}>{a.label}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

// The app-wide one-line status ("Saved", "Couldn't sync"). Anything calls useToast.show; only this renders it.
export function Toast() {
  const message = useToast((s) => s.message);
  const action = useToast((s) => s.action);
  const hide = useToast((s) => s.hide);
  const fire = useCallback(() => { if (!action) return; void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); action.onPress(); hide(); }, [action, hide]);
  useShake(!!action?.shake, fire);
  if (!message) return null;
  return <ToastCard message={message} actions={action ? [{ label: action.label, onPress: () => { action.onPress(); hide(); } }] : []} />;
}


// iOS presents card, note, search and resurface as native modal sheets, which sit above the root layout and
// so above its toast. Each of those screens mounts one of these so "Link copied" is seen where it was tapped.
// Android keeps every route in one view tree, where the root toast already shows.
export function ModalToast({ bottom = 0 }: { bottom?: number }) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  if (RN.OS !== 'ios') return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: space[4], right: space[4], bottom: insets.bottom + bottom + space[3] }}>
      <Toast />
    </View>
  );
}
