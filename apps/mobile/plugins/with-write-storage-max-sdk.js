const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

/**
 * Caps WRITE_EXTERNAL_STORAGE at API 32 (jits-mafl.1, review N4).
 *
 * expo-media-library declares WRITE_EXTERNAL_STORAGE with no ceiling, but the
 * app only needs it to save a reel on API 32 and below: on API 33+ the
 * permission no longer exists for app media and `saveToLibraryAsync` needs
 * none. Uncapped, Play lists a storage permission the app never uses on
 * current devices. `tools:replace` makes this ceiling win over any library
 * manifest that declares the same permission at merge time.
 */
const PERMISSION = "android.permission.WRITE_EXTERNAL_STORAGE";
const MAX_SDK = "32";

/** The manifest half, pure, so the test can assert it without a prebuild. */
function capWriteExternalStorage(androidManifest) {
  AndroidConfig.Manifest.ensureToolsAvailable(androidManifest);
  const manifest = androidManifest.manifest;
  if (!Array.isArray(manifest["uses-permission"])) manifest["uses-permission"] = [];
  const list = manifest["uses-permission"];
  let entry = list.find((p) => p.$ && p.$["android:name"] === PERMISSION);
  if (!entry) {
    entry = { $: { "android:name": PERMISSION } };
    list.push(entry);
  }
  entry.$["android:maxSdkVersion"] = MAX_SDK;
  entry.$["tools:replace"] = "android:maxSdkVersion";
  return androidManifest;
}

module.exports = function withWriteStorageMaxSdk(config) {
  return withAndroidManifest(config, (cfg) => {
    capWriteExternalStorage(cfg.modResults);
    return cfg;
  });
};

module.exports.capWriteExternalStorage = capWriteExternalStorage;
module.exports.PERMISSION = PERMISSION;
module.exports.MAX_SDK = MAX_SDK;
