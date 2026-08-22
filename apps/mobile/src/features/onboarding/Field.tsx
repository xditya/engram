import { TextInput, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme/useTheme';

// Single-line input on surface2; mono for URLs, keys and usernames.
export function Field({ mono, style, ...rest }: TextInputProps & { mono?: boolean }) {
  const { c, radius, space } = useTheme();
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={c.text3}
      {...rest}
      style={[{
        minHeight: 44, paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.md,
        backgroundColor: c.surface2, color: c.text, fontSize: 15, fontFamily: mono ? 'GeistMono' : 'Geist',
      }, style]}
    />
  );
}
