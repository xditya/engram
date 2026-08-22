import { View } from 'react-native';
import { Trace } from '../src/icons/Icon';
import { getEngram } from '../src/lib/engram';
import { useTheme } from '../src/theme/useTheme';
import { Screen, Text } from '../src/ui';

// Placeholder Library: wordmark plus the empty state. The grid replaces this in a later phase.
export default function Library() {
  const { c, space } = useTheme();
  const { error } = getEngram();

  return (
    <Screen>
      <View style={{ height: 52, justifyContent: 'center', paddingHorizontal: space[4] }}>
        <Text weight={600} style={{ fontSize: 17 }}>engram</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[6], gap: space[4] }}>
        {error ? (
          <>
            <Text size="lg" weight={500}>Database unavailable</Text>
            <Text size="sm" color="text2" mono style={{ textAlign: 'center' }}>{error.message}</Text>
          </>
        ) : (
          <>
            <Trace size={48} opacity={0.3} color={c.accent} />
            <Text size="lg" weight={500}>Nothing here yet.</Text>
            <Text size="sm" color="text2" style={{ textAlign: 'center' }}>
              Share something to engram from any app, or tap +.
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}
