module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated 4 delegates worklet transforms to react-native-worklets;
    // this plugin must be listed last.
    plugins: ['react-native-worklets/plugin'],
  };
};
