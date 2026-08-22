import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme/useTheme';

// 2 px indeterminate line on a surface2 track. The app never shows a spinner.
export function ProgressLine() {
  const { c } = useTheme();
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.cubic) }), -1);
  }, [x]);
  const bar = useAnimatedStyle(() => ({ transform: [{ translateX: `${x.value * 100}%` }] }));
  return (
    <View style={{ height: 2, backgroundColor: c.surface2, overflow: 'hidden' }} accessibilityRole="progressbar">
      <Animated.View style={[{ width: '40%', height: 2, backgroundColor: c.accent }, bar]} />
    </View>
  );
}
