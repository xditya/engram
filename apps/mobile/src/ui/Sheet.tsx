import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, SlideInDown, SlideOutDown, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';

const ease = Easing.out(Easing.cubic);

// Edge-to-edge windows don't shrink for the keyboard, so the sheet lifts itself by its height.
export function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

// Bottom sheet: dimmed scrim, surface panel with the sheet radius and a grab handle.
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const { c, radius, motion, space } = useTheme();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  // A downward drag on the panel closes it; the offset keeps taps and short scrolls inside the sheet untouched.
  const pan = Gesture.Pan().activeOffsetY(14).failOffsetY(-14).onEnd((e) => { if (e.translationY > 60 || e.velocityY > 900) runOnJS(onClose)(); });
  if (!open) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={FadeIn.duration(motion.slow)} exiting={FadeOut.duration(motion.base)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />
      </Animated.View>
      <GestureDetector gesture={pan}>
      <Animated.View
        entering={SlideInDown.duration(motion.slow).easing(ease)}
        exiting={SlideOutDown.duration(motion.base).easing(ease)}
        layout={LinearTransition.duration(motion.base).easing(ease)}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: c.surface,
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
          paddingHorizontal: space[4],
          paddingBottom: Math.max(insets.bottom, kb) + space[4],
        }}
      >
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.line, marginVertical: space[2] }} />
        {children}
      </Animated.View>
      </GestureDetector>
    </View>
  );
}
