import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * JS face of the local `BackupExclusion` native module.
 *
 * `requireOptionalNativeModule` rather than `requireNativeModule`: it
 * returns null instead of throwing when the native half is not in the
 * binary. That is the normal state in three places that all matter here,
 * and none of them should crash:
 *
 *   - Jest, which loads this file transitively through `recording-file.ts`;
 *   - any build made before this module existed, which an OTA update can
 *     still land on (a JS bundle can never carry a native module);
 *   - Expo Go.
 *
 * In all three the upload still works; only the backup exclusion is absent,
 * which is exactly the degradation this feature is allowed to have.
 */
interface BackupExclusionNativeModule {
  setExcludedFromBackup(uri: string, excluded: boolean): boolean;
  isExcludedFromBackup(uri: string): boolean;
}

const native = requireOptionalNativeModule<BackupExclusionNativeModule>("BackupExclusion");

/** True when the native half is present and can actually set the flag. */
export const isBackupExclusionSupported: boolean = native != null && Platform.OS === "ios";

/**
 * Which of the three populations this install is in.
 *
 * `isBackupExclusionSupported` alone cannot answer the question this feature
 * needs answered, because it is false for two completely different reasons.
 * On Android false is CORRECT: exclusion there is declarative, via
 * `plugins/with-android-backup-rules.js`, and nothing is wrong. On iOS false
 * means the native module is not in this binary and clips ARE being backed
 * up. Reporting both as one value would bury the second in the first.
 *
 *   active         iOS with the module. The flag is really being set.
 *   missing        iOS without it. The exclusion is silently inert HERE.
 *   not-applicable Android, handled by the manifest backup rules instead.
 *
 * "missing" is not hypothetical. `expo.version` is 0.2.0 with a
 * `runtimeVersion` policy of `appVersion`, so the TestFlight build that adds
 * this module and every already-installed 0.2.0 binary share a runtime
 * version and accept the same OTA. A JS bundle can never carry a native
 * module, so after that build there will be two populations running
 * identical JS, and this is what tells them apart.
 */
export type BackupExclusionStatus = "active" | "missing" | "not-applicable";

export const backupExclusionStatus: BackupExclusionStatus =
  Platform.OS !== "ios" ? "not-applicable" : isBackupExclusionSupported ? "active" : "missing";

/**
 * Ask iOS to keep `uri` out of iCloud and iTunes backups.
 *
 * Returns `true` only when the flag was genuinely written. `false` covers
 * every other case: Android (where exclusion is declarative, see
 * `plugins/with-android-backup-rules.js`), a build without the native
 * module, a path that does not exist, and a write the OS refused. It never
 * throws, because the caller is a best-effort step in front of an upload
 * that matters more than the flag.
 *
 * Synchronous, matching the native `Function`: a local metadata write on a
 * path that runs twice per recording (the directory and the clip).
 */
export function excludeFromBackup(uri: string): boolean {
  if (!native) return false;
  try {
    return native.setExcludedFromBackup(uri, true);
  } catch {
    return false;
  }
}

/**
 * Read the flag back. Exists so the exclusion can be verified on a real
 * device or TestFlight build, which is the only place it can be verified at
 * all.
 */
export function isExcludedFromBackup(uri: string): boolean {
  if (!native) return false;
  try {
    return native.isExcludedFromBackup(uri);
  } catch {
    return false;
  }
}
