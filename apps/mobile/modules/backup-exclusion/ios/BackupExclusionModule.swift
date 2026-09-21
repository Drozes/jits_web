import ExpoModulesCore

/**
 Marks a file or directory as excluded from iCloud and iTunes backup.

 WHY THIS IS NATIVE. `NSURLIsExcludedFromBackupKey` is a per-URL resource
 value written at runtime through `setResourceValue`, not an Info.plist key,
 so no Expo config plugin can set it and `expo-file-system` exposes no API
 for it (verified against `expo-file-system@19.0.22`: no backup-related
 symbol exists in its iOS or Android sources).

 WHY IT MATTERS HERE. `Paths.document` resolves to `<app>/Documents/`, which
 iOS backs up to iCloud by default. `lib/video/recording-file.ts` parks a
 300-600 MB match recording there whenever an upload cannot finish, so a
 user who is offline overnight would have that clip counted against a 5 GB
 free iCloud tier. It also brushes the iOS Data Storage Guidelines (2.5.2),
 which is an App Review risk once every match is recorded.
 */
public final class BackupExclusionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BackupExclusion")

    /**
     Set (or clear) the exclusion flag on `uri`.

     Synchronous on purpose. This is a single local metadata write, and the
     caller (`retainRecording`) is a synchronous function whose contract the
     upload manager and its tests depend on; making it async would force a
     floating promise into the one code path that must not grow surprises.

     Returns `false` rather than throwing when the path does not exist or the
     flag cannot be written. The caller treats backup exclusion as
     best-effort: the upload it protects matters more than the exclusion, so
     a failure here must never break retention.
     */
    Function("setExcludedFromBackup") { (uri: String, excluded: Bool) -> Bool in
      guard var url = URL(string: uri), url.isFileURL else {
        return false
      }
      guard FileManager.default.fileExists(atPath: url.path) else {
        // The flag is a resource value ON an existing inode. Setting it
        // against a missing path silently does nothing, so report it
        // instead of claiming success.
        return false
      }
      do {
        var values = URLResourceValues()
        values.isExcludedFromBackup = excluded
        try url.setResourceValues(values)
        return true
      } catch {
        return false
      }
    }

    /** Read the flag back. Exists so a build can be verified on a device. */
    Function("isExcludedFromBackup") { (uri: String) -> Bool in
      guard let url = URL(string: uri), url.isFileURL else {
        return false
      }
      let values = try? url.resourceValues(forKeys: [.isExcludedFromBackupKey])
      return values?.isExcludedFromBackup ?? false
    }
  }
}
