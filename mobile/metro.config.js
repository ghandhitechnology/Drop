// Metro configuration for Drop.
//
// `mobile/` is a standalone npm project (its own lockfile, deliberately not a
// root workspace). The water engine lives one directory up in
// `packages/water-engine` and is linked in as a `file:` dependency, which npm
// installs as a symlink into `mobile/node_modules/@drop/water-engine`.
//
// Metro resolves that symlink to its real path — which sits outside
// `projectRoot` — so the folder has to be watched explicitly, otherwise Metro
// refuses to serve the engine's TypeScript source. `extraNodeModules` keeps
// resolution working even before `npm install` has recreated the symlink.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');
const waterEngineRoot = path.resolve(repoRoot, 'packages/water-engine');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), waterEngineRoot];

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@drop/water-engine': waterEngineRoot,
};

// The engine has no node_modules of its own; keep every bare import resolving
// against the app's own tree so a single copy of React et al. is bundled.
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(projectRoot, 'node_modules'),
];

// expo-sqlite's web worker imports wa-sqlite's WebAssembly binary directly, and
// `.wasm` is not one of the extensions Metro resolves by default — so the web
// bundle fails on a file that is sitting right there in node_modules. Native
// builds never reach this import; registering the extension only affects web.
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

module.exports = config;
