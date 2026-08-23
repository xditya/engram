import type { ConfigContext, ExpoConfig } from 'expo/config';

const APP_GROUP = 'group.app.engram';
const DOMAIN = 'engram.xditya.me';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'engram',
  slug: 'engram',
  scheme: 'engram',
  version: '0.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'app.engram',
    supportsTablet: true,
    icon: { light: './assets/icon-light.png', dark: './assets/icon.png', tinted: './assets/icon-tinted.png' },
    associatedDomains: [`applinks:${DOMAIN}`, `webcredentials:${DOMAIN}`],
    entitlements: { 'com.apple.security.application-groups': [APP_GROUP] },
    infoPlist: {
      NSPhotoLibraryUsageDescription: 'Save photos from your library into engram.',
      NSCameraUsageDescription: 'Capture a photo straight into engram.',
      NSPhotoLibraryAddUsageDescription: 'Export images from engram to your library.',
    },
  },
  android: {
    package: 'app.engram',
    adaptiveIcon: {
      backgroundColor: '#15171A',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    intentFilters: [
      { action: 'VIEW', category: ['DEFAULT', 'BROWSABLE'], data: [{ scheme: 'engram' }] },
      { action: 'VIEW', autoVerify: true, category: ['DEFAULT', 'BROWSABLE'], data: [{ scheme: 'https', host: DOMAIN, pathPrefix: '/save' }] },
    ],
  },
  web: { favicon: './assets/favicon.png', bundler: 'metro', output: 'single' },
  plugins: [
    // react-native-executorch's pod needs iOS 17; keep Android's minimum as Expo sets it.
    ['expo-build-properties', { ios: { deploymentTarget: '17.0' } }],
    'expo-router',
    'expo-dev-client',
    'expo-font',
    'expo-secure-store',
    'expo-image',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 120, backgroundColor: '#F4F5F7', dark: { image: './assets/splash-icon.png', backgroundColor: '#0F1114' } }],
    'expo-background-task',
    'expo-web-browser',
    ['expo-camera', { cameraPermission: 'Capture a photo straight into engram.' }],
    ['expo-image-picker', { photosPermission: 'Save photos from your library into engram.' }],
    ['expo-media-library', { photosPermission: 'Save photos from your library into engram.', savePhotosPermission: 'Export images from engram to your library.' }],
    ['react-native-cloud-storage', { iCloudContainerEnvironment: 'Production' }],
    // Listed before expo-share-intent: later plugins' manifest mods run first, and this one must see its filters.
    './plugins/withShareOverlay',
    ['expo-share-intent', {
      iosActivationRules: { NSExtensionActivationSupportsWebURLWithMaxCount: 1, NSExtensionActivationSupportsWebPageWithMaxCount: 1, NSExtensionActivationSupportsText: true, NSExtensionActivationSupportsImageWithMaxCount: 10, NSExtensionActivationSupportsMovieWithMaxCount: 1, NSExtensionActivationSupportsFileWithMaxCount: 10 },
      iosAppGroupIdentifier: APP_GROUP,
      iosShareExtensionName: 'engram',
      androidIntentFilters: ['text/*', 'image/*', 'video/*', '*/*'],
      androidMultiIntentFilters: ['image/*'],
    }],
  ],
  experiments: { typedRoutes: true },
});
