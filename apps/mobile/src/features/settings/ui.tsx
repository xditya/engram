import type { ReactNode } from 'react';
import { Children, Fragment } from 'react';
import { Pressable, ScrollView, Switch, TextInput, View, type TextInputProps } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/useTheme';
import { Hairline, Screen, Text } from '../../ui';

// Settings page: back chevron + title, then a scrolling column with 16 px gutters.
export function Page({ title, children }: { title: string; children: ReactNode }) {
  const { space } = useTheme();
  const router = useRouter();
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: space[2] }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text size="xl" color="text2">‹</Text>
        </Pressable>
        <Text weight={600} style={{ fontSize: 17 }}>{title}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: space[7], gap: space[5] }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </Screen>
  );
}

// Grouped surface list with hairlines between rows.
export function Group({ label, children }: { label?: string; children: ReactNode }) {
  const { c, space } = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: space[2] }}>
      {label ? <Text size="xs" color="text3" weight={500} style={{ paddingHorizontal: space[1], textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Text> : null}
      <View style={{ backgroundColor: c.surface, borderRadius: 14, overflow: 'hidden' }}>
        {rows.map((r, i) => <Fragment key={i}>{i > 0 ? <Hairline /> : null}{r}</Fragment>)}
      </View>
    </View>
  );
}

export function ToggleRow({ title, subtitle, value, onChange, disabled }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { c, space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: space[4], paddingVertical: space[3], gap: space[3], opacity: disabled ? 0.4 : 1 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15 }}>{title}</Text>
        {subtitle ? <Text size="xs" color="text2" style={{ fontSize: 13 }}>{subtitle}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: c.accent, false: c.surface2 }} accessibilityLabel={title} />
    </View>
  );
}

// Radio row: check glyph on the right when selected.
export function RadioRow({ title, subtitle, selected, onPress }: { title: string; subtitle?: string; selected: boolean; onPress: () => void }) {
  const { space } = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: space[4], paddingVertical: space[3], gap: space[3] }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15 }}>{title}</Text>
        {subtitle ? <Text size="xs" color="text2" style={{ fontSize: 13 }}>{subtitle}</Text> : null}
      </View>
      <Text color="accent" style={{ opacity: selected ? 1 : 0 }}>✓</Text>
    </Pressable>
  );
}

// Large radio card (the Intelligence chooser). Accent outline when selected; children show only then.
export function RadioCard({ title, body, selected, onPress, badge, children }: { title: string; body: string; selected: boolean; onPress: () => void; badge?: string; children?: ReactNode }) {
  const { c, space } = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={{ backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: selected ? c.accent : c.line, padding: space[4], gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: selected ? 6 : 1.5, borderColor: selected ? c.accent : c.text3 }} />
        <Text size="md" weight={500} style={{ flex: 1 }}>{title}</Text>
        {badge ? <Text size="xs" mono color="text3">{badge}</Text> : null}
      </View>
      <Text size="sm" color="text2">{body}</Text>
      {selected && children ? <View style={{ gap: space[3], paddingTop: space[2] }}>{children}</View> : null}
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.id)} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 7, backgroundColor: on ? c.accentSoft : 'transparent', borderWidth: on ? 0 : 1, borderColor: c.line }}>
            <Text size="sm" weight={500} color={on ? 'accent' : 'text2'}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Labelled mono input on a surface2 well.
export function Field({ label, right, ...input }: { label: string; right?: ReactNode } & TextInputProps) {
  const { c, space, font } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text size="xs" color="text3">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface2, borderRadius: 10, paddingLeft: space[3], minHeight: 44 }}>
        <TextInput
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={c.text3}
          {...input}
          style={{ flex: 1, fontFamily: font.mono, fontSize: 14, color: c.text, paddingVertical: 10 }}
        />
        {right}
      </View>
    </View>
  );
}

export function InlineButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
      <Text size="sm" color="accent" weight={500}>{title}</Text>
    </Pressable>
  );
}

export const n = (x: number) => x.toLocaleString('en-US');
export const hhmm = (t: number) => new Date(t).toTimeString().slice(0, 5);
