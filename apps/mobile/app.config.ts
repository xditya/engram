import type { ConfigContext, ExpoConfig } from 'expo/config';

const APP_GROUP = 'group.app.engram';
const DOMAIN = 'engram.xditya.me';
const ALT_ICONS: [string, string][] = [['paper', '#F4F5F7'], ['indigo', '#2E4FD6'], ['ink', '#000000']];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'engram',
  slug: 'engram',
  // 'app.engram' and the reversed Google client id are the OAuth redirect schemes Google requires on Android / iOS.
  scheme: ['engram', 'app.engram', 'com.googleusercontent.apps.290401707658-8ages5t18uh6v285nlik5afm87j7dpv7'],
  version: '1.8.0',
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
      AppGroup: APP_GROUP, // read by expo-share-extension (plugin and Swift) and EngramDiag
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
    // Alternate launcher icons. graphite is the default (MainActivity / AppIcon). Listed before withShareOverlay so its
    // manifest mod runs after the SEND filters have moved to ShareActivity: the aliases copy MainActivity's filters, and
    // must carry the VIEW deep links (the module disables MainActivity while an alias is active) but not the share ones.
    ['@howincodes/expo-dynamic-app-icon', Object.fromEntries(ALT_ICONS.map(([name, bg]) => [name, {
      // All three appearances declared, else iOS 18 synthesises dark/tinted from the light image and only the glyph survives.
      ios: { light: `./assets/icons/${name}.png`, dark: `./assets/icons/${name}.png`, tinted: './assets/icon-tinted.png' },
      android: { foregroundImage: `./assets/icons/${name}-fg.png`, backgroundColor: bg },
    }]))],
    // Listed before expo-share-intent: later plugins' manifest mods run first, and this one must see its filters.
    './plugins/withShareOverlay',
    // Android only (disableIOS): the iOS share sheet entry is expo-share-extension's target below, so exactly one
    // .appex ships. Its native iOS module still compiles into the app; nothing imports it there.
    ['expo-share-intent', {
      disableIOS: true,
      androidIntentFilters: ['text/*', 'image/*', 'video/*', '*/*'],
      androidMultiIntentFilters: ['image/*'],
    }],
    // iOS share extension running the Save Moment overlay (src/features/share/ShareExtensionRoot, entry
    // index.share.js). Listed before expo-share-extension so withShareExtension's mods see its generated files.
    './plugins/withShareExtension',
    ['expo-share-extension', {
      activationRules: [{ type: 'url', max: 1 }, { type: 'text' }, { type: 'image', max: 10 }, { type: 'video', max: 1 }, { type: 'file', max: 10 }],
      backgroundColor: { red: 0, green: 0, blue: 0, alpha: 0 }, // the overlay draws its own scrim over the sharing app
      // Expo modules left out of the extension target (pods and the generated modules provider). Everything the
      // overlay imports stays; the rest would only cost launch memory inside the extension's ~120 MB budget.
      excludedPackages: [
        'expo-dev-client', 'expo-dev-launcher', 'expo-dev-menu', 'expo-dev-menu-interface', 'expo-updates-interface',
        'expo-splash-screen', 'expo-router', 'expo-linking', 'expo-keep-awake', 'expo-system-ui', 'expo-symbols', 'expo-glass-effect',
        '@expo/dom-webview', '@expo/ui', 'expo-camera', 'expo-media-library', 'expo-image-picker', 'expo-document-picker',
        'expo-video-thumbnails', 'expo-background-task', 'expo-task-manager', 'expo-screen-capture', 'expo-sensors',
        'expo-network', 'expo-device', 'expo-clipboard', 'expo-blur', 'expo-share-intent',
        '@howincodes/expo-dynamic-app-icon', 'engram-ocr', 'engram-screenshots',
      ],
    }],
  ],
  experiments: { typedRoutes: true },
});
