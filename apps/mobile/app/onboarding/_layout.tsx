import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/useTheme';

export default function OnboardingLayout() {
  const { c } = useTheme();
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false, animation: 'fade', contentStyle: { backgroundColor: c.bg } }} />;
}
