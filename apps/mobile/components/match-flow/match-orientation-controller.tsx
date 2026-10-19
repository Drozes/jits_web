import * as React from "react";
import { allowRotation, lockLandscape, lockPortrait, lockToCurrent } from "@/lib/orientation";
import { useMatchRecorder } from "./match-recorder-context";

export type OrientationMode = "ready" | "live" | "other";

/**
 * How the match is recorded (timekeeper mode ARCHITECTURE 2.8, the input
 * the capture policy sets):
 *  - "free" (the default, today): the ready check follows the phone and
 *    going live locks whichever side the interface is in;
 *  - "portrait_locked": portrait on every step;
 *  - "landscape_locked": the ready check turns to landscape (either side)
 *    and going live locks the side it is in.
 */
export type RecordingOrientation = "free" | "portrait_locked" | "landscape_locked";

type Target = "rotate" | "landscape" | "live" | "portrait";

function targetFor(mode: OrientationMode, recorderState: string, orientation: RecordingOrientation): Target {
  if (orientation === "portrait_locked") return "portrait";
  if (mode === "ready") return orientation === "landscape_locked" ? "landscape" : "rotate";
  return mode === "live" || recorderState === "stopping" ? "live" : "portrait";
}

/**
 * Orientation policy for the match wizard and practice. By default the
 * ready check follows the phone so the athlete can frame a wide shot; going
 * live locks whatever orientation the interface is in (the clip records in
 * it), and the lock holds while the recorder is still `stopping` so the
 * camera view never rotates under a finalizing clip. Everything else, and
 * unmount, is portrait. `recordingOrientation` changes the ready and live
 * locks (see `RecordingOrientation`).
 *
 * Render it inside `MatchRecorderProvider` BEFORE the step renderer: sibling
 * effects run in tree order, so the live lock is requested before the live
 * step's `recorder.start()`.
 */
export function MatchOrientationController({
  mode,
  recordingOrientation = "free",
}: {
  mode: OrientationMode;
  recordingOrientation?: RecordingOrientation;
}) {
  const { state } = useMatchRecorder();
  const target = targetFor(mode, state, recordingOrientation);

  const lastRef = React.useRef<Target | null>(null);
  React.useEffect(() => {
    if (lastRef.current === target) return;
    lastRef.current = target;
    if (target === "rotate") void allowRotation();
    else if (target === "landscape") void lockLandscape();
    else if (target === "live") void lockToCurrent();
    else void lockPortrait();
  }, [target]);

  React.useEffect(() => () => void lockPortrait(), []);
  return null;
}

/** Maps a wizard step or practice phase onto the controller's mode. */
export function orientationModeFor(step: string | null): OrientationMode {
  return step === "ready" ? "ready" : step === "live" ? "live" : "other";
}
