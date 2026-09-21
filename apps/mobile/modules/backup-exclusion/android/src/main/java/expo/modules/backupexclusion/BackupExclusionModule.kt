package expo.modules.backupexclusion

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android half of the backup-exclusion module.
 *
 * DELIBERATELY A NO-OP, and it reports that honestly rather than returning
 * `true`. Android has no per-file equivalent of
 * `NSURLIsExcludedFromBackupKey`: what a file is or is not backed up by is
 * decided declaratively, by the `android:dataExtractionRules` (API 31+) and
 * `android:fullBackupContent` (API 23-30) XML that
 * `plugins/with-android-backup-rules.js` installs, which excludes
 * `match-uploads/` from `filesDir` at the manifest level.
 *
 * The only imperative alternative would be `Context.getNoBackupFilesDir()`,
 * which is excluded automatically, but that means MOVING the directory, and
 * the whole point of `recording-file.ts` is that the clip lives somewhere
 * durable and predictable.
 *
 * This half exists so the JS side has one call that is safe on both
 * platforms, and so a `false` here is a truthful "not applicable" instead of
 * a missing-module crash.
 */
class BackupExclusionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BackupExclusion")

    Function("setExcludedFromBackup") { _: String, _: Boolean ->
      false
    }

    Function("isExcludedFromBackup") { _: String ->
      false
    }
  }
}
