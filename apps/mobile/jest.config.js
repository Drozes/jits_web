// Suppress version mismatch warning between react and react-test-renderer.
// jest-expo bundles react-test-renderer@19.2.0 while the app uses react@19.1.0;
// both are React 19.x and work fine in practice.
process.env.RNTL_SKIP_DEPS_CHECK = "true";

// Run every suite in a zone behind UTC (the team's zone), the same on a dev
// Mac and on the UTC GitHub runner. The DOB / under-16 cutoff suites assert
// that a cutoff follows the UTC date while the local date is a day behind.
// Setting process.env.TZ inside a test file does not work: jest gives each
// test file a sandboxed copy of process.env, so the real process keeps its
// zone and those suites only passed on machines already in Toronto
// (jits-psyv). The workers inherit this from the parent process.
process.env.TZ = "America/Toronto";

module.exports = {
  preset: "jest-expo",
  // jest's default testMatch treats EVERY .ts file under __tests__ as a suite.
  // __tests__/support/ holds shared helpers (the WCAG math and AA threshold
  // table imported by both token suites), not tests.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/__tests__/support/"],
  setupFilesAfterEnv: ["@testing-library/jest-native/extend-expect", "<rootDir>/jest.setup.js"],
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
