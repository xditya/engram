import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';

// One font map for the app, the Android share overlay and the iOS share extension. Geist Mono comes from
// Vercel's own hinted build: the Google Fonts build renders with doubled letter spacing on iOS.
export const FONTS = {
  Geist: Geist_400Regular,
  'Geist-Medium': Geist_500Medium,
  'Geist-SemiBold': Geist_600SemiBold,
  GeistMono: require('../../assets/fonts/GeistMono-Regular.ttf'),
  'GeistMono-Medium': require('../../assets/fonts/GeistMono-Medium.ttf'),
};
