import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Trace } from '../../src/icons/Icon';
import { Step } from '../../src/features/onboarding/Step';
import { useTheme } from '../../src/theme/useTheme';
import { Button, Text } from '../../src/ui';

export default function Welcome() {
  const { c, space, motion } = useTheme();
  const router = useRouter();
  return (
    <Step n={1} footer={<Button title="Begin" height={52} onPress={() => router.push('/onboarding/save')} />}>
      <View style={{ alignItems: 'center', paddingTop: space[7], gap: space[5] }}>
        <Animated.View entering={FadeIn.duration(motion.stroke)}>
          <Trace size={64} color={c.accent} />
        </Animated.View>
        <Text size="display" weight={600}>engram</Text>
        <Text color="text2" style={{ textAlign: 'center' }}>Save anything. Find it later. It never leaves your device.</Text>
        <Button title="I already use engram on another device" variant="text" onPress={() => router.push('/sync/link')} />
      </View>
    </Step>
  );
}
