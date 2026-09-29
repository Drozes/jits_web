import * as Application from "expo-application";
import * as Updates from "expo-updates";

export type AppVersionInfo = {
  appVersion: string | null;
  buildNumber: string | null;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
};

/**
 * The running binary and JS bundle. Build number comes from the native
 * binary (EAS-remote `autoIncrement`, so `app.json` `buildNumber` is not
 * authoritative). `expo-application` is already linked into build 23 via
 * `expo-notifications`, so reading it is OTA-safe.
 */
export function readAppVersionInfo(): AppVersionInfo {
  return {
    appVersion: Application.nativeApplicationVersion,
    buildNumber: Application.nativeBuildVersion,
    updateId: Updates.updateId,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  };
}

/** e.g. "v0.4.0 (23) · OTA 9287a1e5", or "· Embedded" when no OTA is running. */
export function formatAppVersion(info: AppVersionInfo): string {
  const version = info.appVersion ? `v${info.appVersion}` : "v?";
  const build = info.buildNumber ? ` (${info.buildNumber})` : "";
  const ota =
    info.updateId && !info.isEmbeddedLaunch
      ? `OTA ${info.updateId.slice(0, 8)}`
      : "Embedded";
  return `${version}${build} · ${ota}`;
}
