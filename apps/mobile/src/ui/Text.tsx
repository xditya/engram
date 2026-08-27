import { PixelRatio, StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';
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

// Dynamic Type only ever enlarges: a text size set below the system default would shrink every label while the
// layout stays put (iOS scales text, not boxes), so below 1x is treated as 1x; above it is honoured up to 1.3x.
// iOS share extensions mis-scale RN text with Dynamic Type on; the extension root turns scaling off before rendering.
export const textDefaults = { allowFontScaling: PixelRatio.getFontScale() >= 1, maxMultiplier: 1.3 };
// The same clamp for chrome drawn in points (search bar, FAB, header icons), so it grows with the text it sits beside.
export const uiScale = Math.min(textDefaults.maxMultiplier, Math.max(1, PixelRatio.getFontScale()));

// Fonts are registered in app/_layout.tsx under these exact family names.
const family = (mono: boolean, w: Weight) =>
  mono ? (w === 400 ? 'GeistMono' : 'GeistMono-Medium') : w === 400 ? 'Geist' : w === 500 ? 'Geist-Medium' : 'Geist-SemiBold';

export function Text({ size = 'md', weight = 400, mono = false, color = 'text', lineHeight, style, ...rest }: TextProps) {
  const t = useTheme();
  const px = (StyleSheet.flatten(style)?.fontSize as number | undefined) ?? t.font.size[size];
  const lh = lineHeight ?? (px >= 22 ? 'tight' : 'body');
  return (
    <RNText
      allowFontScaling={textDefaults.allowFontScaling}
      maxFontSizeMultiplier={textDefaults.maxMultiplier}
      {...rest}
      style={[
        {
          fontFamily: family(mono, weight),
          fontSize: px,
          lineHeight: Math.round(px * t.font.lineHeight[lh]),
          color: t.c[color],
          fontVariant: mono ? [] : ['tabular-nums'], // every mono glyph is tabular already; the feature request is what CoreText can mishandle
          letterSpacing: px > 22 ? -0.01 * px : undefined,
        },
        style,
      ]}
    />
  );
}
