const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// .svg files become React components (react-native-svg-transformer).
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer/expo');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts.push('svg');

// Native-only packages resolve to an empty module on web so `expo export --platform web` keeps working.
// Call sites guard with Platform.OS === 'web' before touching them.
const NATIVE_ONLY = new Set([
  '@op-engineering/op-sqlite', 'react-native-executorch', 'expo-share-intent', 'expo-task-manager',
  'expo-background-task', 'react-native-cloud-storage', 'expo-video-thumbnails',
]);
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && NATIVE_ONLY.has(moduleName)) return { type: 'empty' };
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
