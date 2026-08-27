import { useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { Button } from './Button';
import { Text } from './Text';

// A small "?" that opens a sheet with a title and a few lines. For places where a word (Operators, Spaces)
// needs one paragraph of explanation without taking space on the screen itself.
// Plain RN Modal on purpose: reanimated + gesture-handler inside a Modal deadlocks the Android UI thread.
export function HelpTip({ title, lines, children }: { title: string; lines: (string | [string, string])[]; children?: ReactNode }) {
  const { c, space, radius } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const y = useRef(new Animated.Value(48)).current;
  const close = () => setOpen(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`What is ${title}?`} onPress={() => setOpen(true)} hitSlop={10}
        style={({ pressed }) => ({ width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: c.line, backgroundColor: pressed ? c.surface2 : 'transparent', alignItems: 'center', justifyContent: 'center' })}>
        <Text size="xs" weight={600} color="text2" style={{ lineHeight: 14 }}>?</Text>
      </Pressable>
      {/* The scrim fades and only the panel slides; Android's "slide" modal would drag the black scrim up with it. */}
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={close} onShow={() => { y.setValue(48); Animated.timing(y, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }}>
        <Pressable accessibilityLabel="Close" onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        <Animated.View style={{ transform: [{ translateY: y }], backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: space[4], paddingBottom: insets.bottom + space[4] }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.line, marginVertical: space[2] }} />
          <View style={{ gap: space[3], paddingVertical: space[2] }}>
            <Text size="lg" weight={600}>{title}</Text>
            <ScrollView style={{ maxHeight: Math.round(height * 0.55) }} contentContainerStyle={{ gap: space[3] }} showsVerticalScrollIndicator={false}>
              {lines.map((l, i) => Array.isArray(l) ? (
                <View key={i} style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
                  <Text size="sm" mono color="accent" style={{ minWidth: 92 }}>{l[0]}</Text>
                  <Text size="sm" color="text2" style={{ flex: 1 }}>{l[1]}</Text>
                </View>
              ) : (
                <Text key={i} size="sm" color="text2" lineHeight="body">{l}</Text>
              ))}
              {children}
            </ScrollView>
            <Button title="Done" variant="outline" height={44} onPress={close} />
          </View>
        </Animated.View>
      </Modal>
    </>
  );
}
