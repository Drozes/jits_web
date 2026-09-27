import * as React from "react";
import { allowRotation, lockPortrait, lockToCurrent } from "@/lib/orientation";
import { useMatchRecorder } from "./match-recorder-context";

export type OrientationMode = "ready" | "live" | "other";

type Target = "rotate" | "live" | "portrait";

/**
 * Orientation policy for the match wizard and practice. The ready check
 * follows the phone so the athlete can frame a wide shot; going live locks
 * whatever orientation the interface is in (the clip records in it), and
 * the lock holds while the recorder is still `stopping` so the camera view
 * never rotates under a finalizing clip. Everything else, and unmount, is
 * portrait.
 *
 * Render it inside `MatchRecorderProvider` BEFORE the step renderer: sibling
 * effects run in tree order, so the live lock is requested before the live
 * step's `recorder.start()`.
 */
export function MatchOrientationController({ mode }: { mode: OrientationMode }) {
  const { state } = useMatchRecorder();
  const target: Target =
    mode === "ready" ? "rotate" : mode === "live" || state === "stopping" ? "live" : "portrait";

  const lastRef = React.useRef<Target | null>(null);
  React.useEffect(() => {
    if (lastRef.current === target) return;
    lastRef.current = target;
    if (target === "rotate") void allowRotation();
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
