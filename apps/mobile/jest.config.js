// Suppress version mismatch warning between react and react-test-renderer.
// jest-expo bundles react-test-renderer@19.2.0 while the app uses react@19.1.0;
// both are React 19.x and work fine in practice.
process.env.RNTL_SKIP_DEPS_CHECK = "true";

module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["@testing-library/jest-native/extend-expect"],
  transformIgnorePatterns: [
    "node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|native-base|nativewind|react-native-css-interop|react-native-reanimated|lucide-react-native|class-variance-authority|clsx|tailwind-merge|@gorhom|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-toast-message|@supabase|@jits))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@jits/shared$": "<rootDir>/../../packages/shared/src",
    "^@jits/shared/(.*)$": "<rootDir>/../../packages/shared/src/$1",
    // Force all modules to resolve to the same React copy to prevent
    // the "Invalid hook call" error from having two React instances.
    // React is hoisted to the workspace root by npm workspaces.
    "^react$": "<rootDir>/../../node_modules/react",
    "^react/(.*)$": "<rootDir>/../../node_modules/react/$1",
    "^react-test-renderer$": "<rootDir>/../../node_modules/react-test-renderer",
    "^react-test-renderer/(.*)$": "<rootDir>/../../node_modules/react-test-renderer/$1",
  },
};
