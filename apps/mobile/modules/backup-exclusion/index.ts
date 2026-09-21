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
 * Ask iOS to keep `uri` out of iCloud and iTunes backups.
 *
 * Returns `true` only when the flag was genuinely written. `false` covers
 * every other case: Android (where exclusion is declarative, see
 * `plugins/with-android-backup-rules.js`), a build without the native
 * module, a path that does not exist, and a write the OS refused. It never
 * throws, because the caller is a best-effort step in front of an upload
 * that matters more than the flag.
 *
 * Synchronous, matching the native `Function`: one local metadata write, on
 * a path that is called once per recording.
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
