const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;

// Expo SDK 52+ automatically configures Metro for npm/pnpm/yarn workspace
// monorepos. We pass the project root and let `getDefaultConfig` discover the
// workspace root, watch folders, and `nodeModulesPaths` itself. Manual
// overrides (disableHierarchicalLookup, custom nodeModulesPaths) break
// resolution of nested transitive dependencies whose versions diverge from a
// hoisted copy at the workspace root (e.g. semver v7 nested under
// react-native-reanimated when v6 is hoisted at root).
//
// See: https://docs.expo.dev/guides/monorepos/
const config = getDefaultConfig(projectRoot);

module.exports = withNativeWind(config, {
  input: path.join(projectRoot, "global.css"),
});
