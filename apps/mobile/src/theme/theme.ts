// engram — theme.ts
// Populated from the design brief (§7). Deviations from the starting values:
//   · text3 re-tuned in both modes to pass WCAG AA (>= 4.5:1 at 14 px) on bg, surface and surface2
//   · light accent deepened to an indigo-blue (white-on-accent 6.55:1)
//   · accentSoft is 8-digit hex: 10% accent (light) / 14% accent (dark)
// Fonts: bundle via expo-font / @expo-google-fonts/geist; tabular numerals: fontVariant: ['tabular-nums'].

export const theme = {
  color: {
    light: { bg: '#F4F5F7', surface: '#FFFFFF', surface2: '#ECEEF1', text: '#15171A', text2: '#5C6370', text3: '#666D75', line: '#DDE0E5', accent: '#2E4FD6', accentSoft: '#2E4FD61A', danger: '#C2352B' },
    dark:  { bg: '#0F1114', surface: '#17191D', surface2: '#1F2227', text: '#EDEFF2', text2: '#A3A9B3', text3: '#828996', line: '#272A30', accent: '#7B96FF', accentSoft: '#7B96FF24', danger: '#E5574B' },
  },
  font: {
    sans: 'Geist',
    mono: 'GeistMono',
    size: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, display: 34 },
    lineHeight: { tight: 1.2, body: 1.45, reader: 1.55 },
  },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 },
  radius: { sm: 6, md: 10, lg: 16, sheet: 20 },
  motion: { fast: 120, base: 200, slow: 320, stroke: 600 },
  density: {
    comfortable: { cols: -1, gutter: 12 },
    normal:      { cols: 0,  gutter: 8 },
    dense:       { cols: +1, gutter: 4 },
  },
  trace: { minOpacity: 0.25, maxOpacity: 1 },
} as const;
