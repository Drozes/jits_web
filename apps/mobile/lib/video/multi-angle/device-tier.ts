/**
 * Whether this phone may run two angle players hot (decoding at once) or
 * only one, with the others warm (loaded, paused, re-seeked on a switch).
 *
 * Android has no Media Performance Class or `getMaxSupportedInstances()`
 * reachable from JS on build 25, and a budget chip can fail (or fall back
 * to a hot software decoder) with a second hardware decoder, so the guess
 * is deliberately conservative: anything not clearly recent and roomy is
 * warm-only (the owner accepted a slower switch there). iOS has no
 * documented per-app decoder cap for two 720p players.
 *
 * ANDROID_FORCE_WARM_ONLY is the kill switch: a plain constant (no remote
 * config) an OTA can flip if telemetry shows decoder failures.
 */
export type DeviceTier = "full" | "warm-only";

export const ANDROID_FORCE_WARM_ONLY = false;
/** At most this many angle players decode at once on Android (one visible, one standby). */
export const MAX_ANDROID_PLAYING_DECODERS = 2;
/** Hot players on iOS: the visible angle and one standby (a third stays warm). */
export const MAX_IOS_PLAYING_PLAYERS = 2;
/** Android 12 (API 31): older OS images ship on older, slower media stacks. */
export const ANDROID_MIN_API_FOR_HOT = 31;
/** 6 GiB: mid-range and up; 3 to 4 GiB phones are where decoder budgets run out. */
export const ANDROID_MIN_MEMORY_FOR_HOT = 6 * 1024 ** 3;
export const ANDROID_MIN_YEAR_CLASS_FOR_HOT = 2020;

export interface DeviceInfo {
  os: string;
  /** Android API level (Platform.Version). */
  apiLevel: number | null;
  /** expo-device totalMemory, bytes. */
  totalMemory: number | null;
  /** expo-device deviceYearClass. */
  yearClass: number | null;
}

export interface TierVerdict {
  tier: DeviceTier;
  /** Why it is warm-only (telemetry), null when full. */
  reason: "forced" | "old-os" | "low-memory" | "unknown-memory" | "old-device" | null;
}

export function deviceTier(info: DeviceInfo): TierVerdict {
  if (info.os !== "android") return { tier: "full", reason: null };
  if (ANDROID_FORCE_WARM_ONLY) return { tier: "warm-only", reason: "forced" };
  if (info.apiLevel == null || info.apiLevel < ANDROID_MIN_API_FOR_HOT) return { tier: "warm-only", reason: "old-os" };
  if (info.totalMemory == null) return { tier: "warm-only", reason: "unknown-memory" };
  if (info.totalMemory < ANDROID_MIN_MEMORY_FOR_HOT) return { tier: "warm-only", reason: "low-memory" };
  if (info.yearClass != null && info.yearClass < ANDROID_MIN_YEAR_CLASS_FOR_HOT) return { tier: "warm-only", reason: "old-device" };
  return { tier: "full", reason: null };
}

/** How many angle players may decode at once on this platform. */
export function playingCap(os: string, tier: DeviceTier): number {
  if (tier === "warm-only") return 1;
  return os === "android" ? MAX_ANDROID_PLAYING_DECODERS : MAX_IOS_PLAYING_PLAYERS;
}

/** Read the live device (expo-device, linked in build 25 via notifications). */
export function readDeviceInfo(): DeviceInfo {
  // Required lazily so a test or a web bundle without the module still runs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require("react-native") as typeof import("react-native");
  let totalMemory: number | null = null;
  let yearClass: number | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Device = require("expo-device") as typeof import("expo-device");
    totalMemory = typeof Device.totalMemory === "number" ? Device.totalMemory : null;
    yearClass = typeof Device.deviceYearClass === "number" ? Device.deviceYearClass : null;
  } catch {
    /* unknown: Android reads it as warm-only */
  }
  return {
    os: Platform.OS,
    apiLevel: Platform.OS === "android" && typeof Platform.Version === "number" ? Platform.Version : null,
    totalMemory,
    yearClass,
  };
}
