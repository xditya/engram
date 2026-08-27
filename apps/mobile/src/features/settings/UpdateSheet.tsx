import { Linking, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/useTheme';
import { Button, Text } from '../../ui';
import { Markdown } from '../detail/Markdown';
import { RELEASES_PAGE, currentTag, useUpdates } from '../../lib/updates';

// "What's new": every release between the one this build came from and the latest, newest first, straight from
// the release notes the workflow wrote. Mounted once at the root; opened from the update toast or Settings.
export function UpdateSheet() {
  const { c, space, radius } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const open = useUpdates((s) => s.open);
  const setOpen = useUpdates((s) => s.setOpen);
  const latest = useUpdates((s) => s.latest);
  const between = useUpdates((s) => s.between);
  const close = () => setOpen(false);
  if (!latest) return null;
  const jump = between.length;
  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <Pressable accessibilityLabel="Close" onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
      <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: space[4], paddingBottom: insets.bottom + space[4] }}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.line, marginVertical: space[2] }} />
        <View style={{ gap: space[3], paddingVertical: space[2] }}>
          <View>
            <Text size="lg" weight={600}>engram {latest.tag} is out</Text>
            <Text size="xs" mono color="text3">{currentTag ? `you have ${currentTag}` : 'you are on a development build'}{jump > 1 ? ` · ${jump} releases since` : ''}</Text>
          </View>
          <ScrollView style={{ maxHeight: Math.round(height * 0.5) }} contentContainerStyle={{ gap: space[4] }} showsVerticalScrollIndicator={false}>
            {between.map((r) => (
              <View key={r.tag} style={{ gap: space[2] }}>
                {jump > 1 ? <Text size="sm" weight={600} mono color="accent">{r.tag}</Text> : null}
                <Markdown text={r.notes.split(/\n### Install\b/)[0] ?? ''} />
              </View>
            ))}
          </ScrollView>
          <Button title="Get it from engram.xditya.me" onPress={() => { void Linking.openURL(RELEASES_PAGE); close(); }} />
          <Button title="Later" variant="text" height={44} onPress={close} />
        </View>
      </View>
    </Modal>
  );
}
