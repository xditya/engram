import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/useTheme';
import { Text } from '../../ui';

// Back chevron plus a title; every sync screen opens with this.
export function Header({ title, back = true }: { title?: string; back?: boolean }) {
  const { space } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: space[2] }}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={8} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2] }}>
          <Text size="xl" color="text2">‹</Text>
        </Pressable>
      ) : <View style={{ width: 44 }} />}
      {title ? <Text weight={600} style={{ fontSize: 17 }}>{title}</Text> : null}
    </View>
  );
}
