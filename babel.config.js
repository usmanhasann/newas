module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Reanimated v4 (pulled in transitively by NativeWind's css-interop, and used
      // by FlashList) ships its worklets transform here. MUST be the LAST plugin.
      'react-native-worklets/plugin',
    ],
  };
};
