/**
 * The one door to `expo-screen-orientation`. Only the match flow's ready
 * check and live step may rotate; everything else is portrait
 * (`MatchOrientationController` drives this).
 *
 * Crash-safe on purpose: a binary without the native module (an older build
 * that received this JS as an OTA, Expo Go, web, jest) turns every call into
 * a no-op instead of throwing at import. A rejected lock is logged once and
 * swallowed: an orientation failure must never block the match, the
 * recorder or navigation.
 */
import { requireOptionalNativeModule } from "expo-modules-core";

type ScreenOrientationModule = typeof import("expo-screen-orientation");

let loaded: ScreenOrientationModule | null | undefined;

function load(): ScreenOrientationModule | null {
  if (loaded !== undefined) return loaded;
  try {
    loaded = requireOptionalNativeModule("ExpoScreenOrientation")
      ? (require("expo-screen-orientation") as ScreenOrientationModule)
      : null;
  } catch {
    loaded = null;
  }
  return loaded;
}

let warned = false;
function warnOnce(error: unknown) {
  if (warned) return;
  warned = true;
  console.warn(`[orientation] lock failed: ${error instanceof Error ? error.message : String(error)}`);
}

export type InterfaceOrientation = "portrait" | "landscape";

/** Ready check: follow the phone (on iPhone, never upside down). */
export async function allowRotation(): Promise<void> {
  const so = load();
  if (!so) return;
  try {
    await so.lockAsync(so.OrientationLock.DEFAULT);
  } catch (e) {
    warnOnce(e);
  }
}

/** Everywhere outside the ready check and the live step. */
export async function lockPortrait(): Promise<void> {
  const so = load();
  if (!so) return;
  try {
    await so.lockAsync(so.OrientationLock.PORTRAIT_UP);
  } catch (e) {
    warnOnce(e);
  }
}

/**
 * Go live: lock to the specific side the interface is in right now, never
 * the generic landscape lock (a 180 degree flip mid-recording would turn
 * the UI upside down relative to the clip). Upside down or unknown is
 * portrait up.
 */
export async function lockToCurrent(): Promise<InterfaceOrientation> {
  const so = load();
  if (!so) return "portrait";
  try {
    const current = await so.getOrientationAsync();
    const lock =
      current === so.Orientation.LANDSCAPE_LEFT
        ? so.OrientationLock.LANDSCAPE_LEFT
        : current === so.Orientation.LANDSCAPE_RIGHT
          ? so.OrientationLock.LANDSCAPE_RIGHT
          : so.OrientationLock.PORTRAIT_UP;
    await so.lockAsync(lock);
    return lock === so.OrientationLock.PORTRAIT_UP ? "portrait" : "landscape";
  } catch (e) {
    warnOnce(e);
    return "portrait";
  }
}
