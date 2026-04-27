const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..", "..");

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so Metro picks up changes in packages/shared.
config.watchFolders = [workspaceRoot];

// Resolve modules from the app's local node_modules first, then fall back to
// the workspace root where npm hoists shared dependencies.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Prevent Metro from walking up the filesystem looking for node_modules; the
// list above is exhaustive in a workspace setup.
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, {
  input: path.join(projectRoot, "global.css"),
});
