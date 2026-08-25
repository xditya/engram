import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { goHome } from '../../src/lib/nav';
import { Trace } from '../../src/icons/Icon';
import { BACKEND_NAME } from '../../src/features/sync/lib';
import { useEngram, useSettings } from '../../src/lib/engram';
import { useTheme } from '../../src/theme/useTheme';
import { Button, Screen, Text } from '../../src/ui';

export default function RecoveryFailure() {
  const { space } = useTheme();
  const router = useRouter();
  const { engram } = useEngram();
  const backend = useSettings((s) => s.sync.backend);
  const patch = useSettings((s) => s.patch);
  const where = backend === 'webdav' ? 'your server' : `your ${BACKEND_NAME[backend]}`;

  // A new library leaves the old encrypted files alone: sync goes off, the key goes away, nothing remote is touched.
  async function startFresh() {
    await engram?.sync.masterKey.clear();
    patch('sync', { backend: 'off' });
    goHome();
  }

  return (
    <Screen>
      <View style={{ flex: 1, paddingHorizontal: space[5], paddingTop: space[7], gap: space[4] }}>
        <Trace size={48} opacity={0.3} />
        <Text weight={600} style={{ fontSize: 26, lineHeight: 32 }}>This library can't be opened</Text>
        <Text color="text2">
          It's encrypted with a recovery phrase that this device doesn't have. Without the phrase or another device that already has the library, the data can't be recovered. Not by you, and not by engram.
        </Text>
        <View style={{ gap: space[3], marginTop: space[4] }}>
          <Button title="Try the phrase again" variant="outline" onPress={() => router.replace('/sync/restore' as Href)} />
          <Button title="Link from another device" variant="outline" onPress={() => router.replace('/sync/link' as Href)} />
          <Pressable accessibilityRole="button" onPress={() => void startFresh()} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text size="sm" color="text2">Start a new library</Text>
          </Pressable>
          <Text size="xs" color="text3" style={{ textAlign: 'center' }}>The old encrypted files stay in {where} untouched.</Text>
        </View>
      </View>
    </Screen>
  );
}
