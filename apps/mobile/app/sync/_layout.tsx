import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/useTheme';

export default function SyncLayout() {
  const { c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'fade' }}>
      <Stack.Screen name="recovery-failure" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
