/**
 * Tests for the JS face of the local BackupExclusion module (jits-vjbq).
 *
 * WHAT THESE PROVE: that the wrapper degrades instead of crashing when the
 * native half is missing, and that it never lets a native failure escape
 * into the upload path. That degradation is not hypothetical: it is the
 * state in Jest, in Expo Go, and in EVERY build made before this module
 * existed, which an OTA update can still land on, because a JS bundle can
 * never carry a native module.
 *
 * WHAT THESE DO NOT PROVE: that iOS wrote `NSURLIsExcludedFromBackupKey`.
 * That is a native resource value on a real inode and can only be confirmed
 * on a device or TestFlight build, by calling `isExcludedFromBackup()` on
 * the directory after a recording has been parked.
 */

const mockRequireOptional = jest.fn();

jest.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: (...args: unknown[]) => mockRequireOptional(...(args as [])),
}));

/**
 * Fresh import each time, because the module resolves the native half ONCE
 * at import and that resolution is the thing under test.
 */
function load(native: unknown): typeof import("@/modules/backup-exclusion") {
  mockRequireOptional.mockReturnValue(native);
  let mod!: typeof import("@/modules/backup-exclusion");
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@/modules/backup-exclusion");
  });
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("when the native module is absent", () => {
  it("reports itself unsupported rather than throwing at import time", () => {
    const mod = load(null);
    expect(mod.isBackupExclusionSupported).toBe(false);
  });

  it("returns false instead of crashing the upload path", () => {
    const mod = load(null);
    expect(mod.excludeFromBackup("file:///docs/match-uploads")).toBe(false);
    expect(mod.isExcludedFromBackup("file:///docs/match-uploads")).toBe(false);
  });

  it("asks for the module by the name the native side registers", () => {
    load(null);
    expect(mockRequireOptional).toHaveBeenCalledWith("BackupExclusion");
  });
});

describe("when the native module is present", () => {
  it("asks it to SET the flag, not to clear it", () => {
    const setExcludedFromBackup = jest.fn(() => true);
    const mod = load({ setExcludedFromBackup, isExcludedFromBackup: jest.fn(() => true) });

    expect(mod.excludeFromBackup("file:///docs/match-uploads")).toBe(true);
    expect(setExcludedFromBackup).toHaveBeenCalledWith("file:///docs/match-uploads", true);
  });

  it("passes a native refusal through honestly", () => {
    // The native side returns false for a path that does not exist and on
    // Android, where exclusion is declarative. Reporting that as success
    // would hide a clip sitting in the backup set.
    const mod = load({
      setExcludedFromBackup: jest.fn(() => false),
      isExcludedFromBackup: jest.fn(() => false),
    });
    expect(mod.excludeFromBackup("file:///docs/match-uploads")).toBe(false);
  });

  it("swallows a native throw", () => {
    const mod = load({
      setExcludedFromBackup: jest.fn(() => {
        throw new Error("JSI blew up");
      }),
      isExcludedFromBackup: jest.fn(() => {
        throw new Error("JSI blew up");
      }),
    });
    expect(mod.excludeFromBackup("file:///docs/match-uploads")).toBe(false);
    expect(mod.isExcludedFromBackup("file:///docs/match-uploads")).toBe(false);
  });

  it("reads the flag back through the native module", () => {
    // The only affordance for verifying this feature on a real build.
    const isExcludedFromBackup = jest.fn(() => true);
    const mod = load({ setExcludedFromBackup: jest.fn(() => true), isExcludedFromBackup });
    expect(mod.isExcludedFromBackup("file:///docs/match-uploads")).toBe(true);
    expect(isExcludedFromBackup).toHaveBeenCalledWith("file:///docs/match-uploads");
  });
});
