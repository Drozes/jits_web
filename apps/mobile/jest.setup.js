/**
 * Global Jest setup for the mobile app.
 *
 * AsyncStorage is a native module, so importing it under Jest throws
 * "NativeModule: AsyncStorage is null" at module load. That used to affect
 * only the two or three suites that touched theme / splash caching, which
 * declared their own inline mocks. Since match-video uploads persist their
 * job records, AsyncStorage is now a transitive import of the whole
 * match-flow wizard, so the stub belongs here rather than in every suite
 * that happens to render a match.
 *
 * This is the mock the library itself ships for exactly this purpose. A
 * suite that wants to observe or fail storage still declares its own
 * `jest.mock` for the module, which takes precedence over this one.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
