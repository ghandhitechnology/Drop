// babel-preset-expo (SDK 57) automatically appends `react-native-worklets/plugin`
// as the LAST plugin whenever react-native-worklets resolves — verified in
// node_modules/babel-preset-expo/build/configs/expo.js. Adding it manually here
// would register the plugin twice, so we deliberately do not.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
