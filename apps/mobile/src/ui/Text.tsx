import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Size = keyof typeof import('../theme/theme').theme.font.size;
type Weight = 400 | 500 | 600;

export interface TextProps extends RNTextProps {
  size?: Size;
  weight?: Weight;
  mono?: boolean;
  color?: 'text' | 'text2' | 'text3' | 'accent' | 'danger';
  lineHeight?: 'tight' | 'body' | 'reader';
}

// Fonts are registered in app/_layout.tsx under these exact family names.
const family = (mono: boolean, w: Weight) =>
  mono ? (w === 400 ? 'GeistMono' : 'GeistMono-Medium') : w === 400 ? 'Geist' : w === 500 ? 'Geist-Medium' : 'Geist-SemiBold';

export function Text({ size = 'md', weight = 400, mono = false, color = 'text', lineHeight, style, ...rest }: TextProps) {
  const t = useTheme();
  const px = t.font.size[size];
  const lh = lineHeight ?? (px >= 22 ? 'tight' : 'body');
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: family(mono, weight),
          fontSize: px,
          lineHeight: Math.round(px * t.font.lineHeight[lh]),
          color: t.c[color],
          fontVariant: ['tabular-nums'],
          letterSpacing: px > 22 ? -0.01 * px : undefined,
        },
        style,
      ]}
    />
  );
}
