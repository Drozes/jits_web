import * as React from "react";
import { allowRotation, lockLandscape, lockPortrait, lockToCurrent } from "@/lib/orientation";
import type { RecordingOrientation } from "@/lib/match-flow/capture-policy";
import { useMatchRecorder } from "./match-recorder-context";

export type OrientationMode = "ready" | "live" | "other";
export type { RecordingOrientation };

type Target = "rotate" | "landscape" | "live" | "portrait";

function targetFor(mode: OrientationMode, recorderState: string, orientation: RecordingOrientation): Target {
  if (orientation === "portrait_locked") return "portrait";
  if (mode === "ready") return orientation === "landscape_locked" ? "landscape" : "rotate";
  return mode === "live" || recorderState === "stopping" ? "live" : "portrait";
}

/**
 * Orientation policy for the match wizard and practice, driven by the
 * capture policy's `recordingOrientation` (`lib/match-flow/capture-policy.ts`;
 * timekeeper mode spec 13.2, ARCHITECTURE 2.8):
 *  - "portrait_locked" (every role and practice, A21, A23): portrait on the
 *    ready check, on live, while the recorder is stopping, and everywhere
 *    else; the interface never rotates;
 *  - "landscape_locked" (the spec 13.6 review seam): the ready check turns
 *    to landscape (either side), going live locks the side the interface is
 *    in (the clip records in it), and the lock holds while the recorder is
 *    still `stopping` so the camera view never rotates under a finalizing
 *    clip;
 *  - "free" (the flow before A21): the ready check follows the phone, then
 *    the same live lock.
 * Everything else, and unmount, is portrait.
 *
 * Render it inside `MatchRecorderProvider` BEFORE the step renderer: sibling
 * effects run in tree order, so the live lock is requested before the live
 * step's `recorder.start()`.
 */
export function MatchOrientationController({
  mode,
  recordingOrientation,
}: {
  mode: OrientationMode;
  recordingOrientation: RecordingOrientation;
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
