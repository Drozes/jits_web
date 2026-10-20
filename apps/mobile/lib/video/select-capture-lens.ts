/**
 * The capture lens: the timekeeper records on the ultrawide (0.5x) lens to
 * keep the whole mat in frame (timekeeper mode spec 13.3, owner decision
 * A21); everyone else keeps the default back lens.
 *
 * iOS only. expo-camera 17.0.10 (the installed native module, so this is
 * JS-only and OTA-eligible) lists the back lenses with
 * `CameraView.getAvailableLensesAsync()` and switches with the `selectedLens`
 * prop, matching the name natively; an unknown name keeps the default lens.
 * Android has no lens API there and clamps `zoom` at 1x, so an Android
 * timekeeper records on the main lens with the step-back hint (TK-REC1b;
 * DECISIONS O10). The chosen lens goes on the video row (`capture_lens`) so a
 * phone that did not find it shows up in the data.
 */
import * as React from "react";
import { Platform } from "react-native";
import type { MatchVideoCaptureLens } from "@jits/shared/api/match-video-upload";
import type { CaptureLensPreference } from "@/lib/match-flow/capture-policy";

/**
 * iOS names each lens in the phone's language (`localizedName`): "Back Ultra
 * Wide Camera" in English, "Caméra ultra grand-angle arrière" in French (the
 * alpha's two languages; spec 13.3 asks for both to be confirmed on device).
 * The English names of the virtual cameras ("Back Dual Wide Camera", "Back
 * Triple Camera") do not match, so the physical ultrawide is the one chosen.
 */
const ULTRAWIDE_NAME = /ultra/i;

/** The first ultrawide in the phone's lens list, else undefined (the default lens). */
export function pickUltrawideLens(lenses: readonly string[]): string | undefined {
  return lenses.find((name) => ULTRAWIDE_NAME.test(name));
}

/** The one camera call a lens lookup needs (`CameraView` has it). */
export interface LensCamera {
  getAvailableLensesAsync(): Promise<string[]>;
}

/** Before the one retry of an empty or failed lens list. */
export const LENS_RETRY_MS = 500;

/** The phone's back lenses; an empty list when there is no camera or the call fails. */
async function listLenses(cameraRef: { readonly current: LensCamera | null }): Promise<string[]> {
  const camera = cameraRef.current;
  if (!camera) return [];
  try {
    return await camera.getAvailableLensesAsync();
  } catch {
    return [];
  }
}

/**
 * The `selectedLens` for this policy on this phone: the ultrawide's name when
 * the policy prefers it and an iPhone has one, else undefined. Never throws.
 * Every iPhone lists at least its main lens, so an empty list (the view not
 * registered yet) or a failed call is asked once more after `retryMs`, then
 * the default lens stands. Athletes and Android never call the camera at all.
 */
export async function selectCaptureLens(
  preference: CaptureLensPreference,
  cameraRef: { readonly current: LensCamera | null },
  os: string = Platform.OS,
  retryMs: number = LENS_RETRY_MS,
): Promise<string | undefined> {
  if (preference !== "ultrawide_preferred" || os !== "ios") return undefined;
  let lenses = await listLenses(cameraRef);
  if (lenses.length === 0) {
    await new Promise((resolve) => setTimeout(resolve, retryMs));
    lenses = await listLenses(cameraRef);
  }
  return pickUltrawideLens(lenses);
}

export interface CaptureLensChoice {
  /** `CameraView selectedLens`; undefined is the default back lens. */
  selectedLens: string | undefined;
  /** What the video row records (`capture_lens`) and the hint reads. */
  lens: MatchVideoCaptureLens;
}

export interface CaptureLens extends CaptureLensChoice {
  /**
   * The lens is decided: the default preference at once, else once the
   * lookup has answered (or was skipped under a recording). The timekeeper's
   * hint waits for it, so an iPhone with an ultrawide never shows the
   * step-back hint first.
   */
  settled: boolean;
  /** Wire to the camera's `onCameraReady`: the lookup starts there, once (or at the backstop). */
  onCameraReady: () => void;
}

const DEFAULT_LENS: CaptureLensChoice = { selectedLens: undefined, lens: "default" };

/**
 * When the lookup starts anyway if the camera never reports ready (the
 * recorder's own backstop exists because `onCameraReady` sometimes never
 * fires on iOS 26 hardware).
 */
export const LENS_READY_BACKSTOP_MS = 1500;

/**
 * The viewfinder's lens. Looked up once, when its camera first reports ready
 * (the native view is registered by then; `LENS_READY_BACKSTOP_MS` after the
 * camera is up if it never does), on the ready step where a lens switch is
 * harmless. Frozen from the first render with `locked` (the live step, or a
 * clip in progress): a lens switch reconfigures the capture session, so an
 * answer that lands later is dropped and the clip stays on the default lens
 * it started with. A camera first ready while already locked (re-entering a
 * live match after a relaunch) is not asked at all: that clip records on the
 * default lens, a trade-off recorded on jits-o47s.14 (the row says
 * `default`, so it shows in the data).
 */
export function useCaptureLens(
  preference: CaptureLensPreference,
  cameraRef: { readonly current: LensCamera | null },
  cameraUp: boolean,
  locked: boolean,
): CaptureLens {
  const wanted = preference === "ultrawide_preferred";
  const [choice, setChoice] = React.useState<CaptureLensChoice>(DEFAULT_LENS);
  const [answered, setAnswered] = React.useState(false);
  // Latched in the commit, before any answer can land after it.
  const lockedRef = React.useRef(locked);
  React.useLayoutEffect(() => {
    if (locked) lockedRef.current = true;
  }, [locked]);
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const askedRef = React.useRef(false);
  const ask = React.useCallback(() => {
    if (!wanted || askedRef.current) return;
    askedRef.current = true;
    if (lockedRef.current) {
      setAnswered(true);
      return;
    }
    void selectCaptureLens(preference, cameraRef).then((name) => {
      if (!mountedRef.current) return;
      setAnswered(true);
      if (!name || lockedRef.current) return;
      setChoice({ selectedLens: name, lens: "ultrawide" });
    });
  }, [wanted, preference, cameraRef]);

  React.useEffect(() => {
    if (!cameraUp || !wanted || askedRef.current) return;
    const backstop = setTimeout(ask, LENS_READY_BACKSTOP_MS);
    return () => clearTimeout(backstop);
  }, [cameraUp, wanted, ask]);

  return { ...choice, settled: !wanted || answered || locked, onCameraReady: ask };
}
