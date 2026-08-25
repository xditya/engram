import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/useTheme';
import { Text, BackButton } from '../../ui';

// Back chevron plus a title; every sync screen opens with this.
export function Header({ title, back = true }: { title?: string; back?: boolean }) {
  const { space } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: space[2] }}>
      {back ? (
        <BackButton />
      ) : <View style={{ width: 44 }} />}
      {title ? <Text size="xl" weight={600} numberOfLines={1} style={{ flex: 1 }}>{title}</Text> : null}
    </View>
  );
}
