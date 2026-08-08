// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Build-time scripts. They never ship inside the bundle, so they run under
    // Node rather than the app's runtime and reach for globals — `Buffer` — that
    // the React Native environment has no business defining.
    files: ["assets/**/tools/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        process: "readonly",
      },
    },
  },
]);
