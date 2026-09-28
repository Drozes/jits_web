import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * Lazy access to the native packages the share funnel uses. Each JS package
 * is required only AFTER its native half is confirmed present, never at
 * module top level: a JS bundle can land by OTA on a binary without the
 * module (and Jest / Expo Go have none), where a top-level import throws at
 * load. Absent means "that capability is unavailable", never a crash.
 */

/** True when the named Expo native module is linked into this binary. */
export function hasNativeModule(name: string): boolean {
  try {
    return requireOptionalNativeModule(name) != null;
  } catch {
    return false;
  }
}

type SharingModule = typeof import("expo-sharing");
type MediaLibraryModule = typeof import("expo-media-library");

export function loadSharing(): SharingModule | null {
  if (!hasNativeModule("ExpoSharing")) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-sharing") as SharingModule;
  } catch {
    return null;
  }
}

export function loadMediaLibrary(): MediaLibraryModule | null {
  if (!hasNativeModule("ExpoMediaLibrary")) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-media-library") as MediaLibraryModule;
  } catch {
    return null;
  }
}

/**
 * `expo-clipboard` is NOT a dependency yet (tier 2, jits-s6mi.6), so its JS
 * package cannot be required here: Metro resolves every literal `require`
 * at bundle time and the export would fail. The native module is called
 * directly instead, which works unchanged on a tier-2 build that embeds it
 * and reports "absent" on every current build.
 */
interface ClipboardNativeModule {
  setStringAsync(text: string, options: Record<string, unknown>): Promise<boolean | void>;
}

export function loadClipboardNative(): ClipboardNativeModule | null {
  try {
    const native = requireOptionalNativeModule<ClipboardNativeModule>("ExpoClipboard");
    return native && typeof native.setStringAsync === "function" ? native : null;
  } catch {
    return null;
  }
}
