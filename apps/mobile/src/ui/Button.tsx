import { Pressable, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'filled' | 'outline' | 'text'; // one filled (accent) button per screen
  danger?: boolean;
  height?: 44 | 48 | 52;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = 'filled', danger, height = 48, disabled, style }: ButtonProps) {
  const { c, dark, radius } = useTheme();
  const filled = variant === 'filled';
  const labelColor = filled ? (dark ? c.bg : '#FFFFFF') : danger ? c.danger : variant === 'text' ? c.accent : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 16,
          backgroundColor: filled ? c.accent : variant === 'outline' ? c.surface : 'transparent',
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: c.line,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <Text size={height === 44 ? 'sm' : 'md'} weight={500} style={{ color: labelColor }}>
        {title}
      </Text>
    </Pressable>
  );
}
