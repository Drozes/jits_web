import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MatchStep } from "@/lib/match-flow/step-router";
import { CameraOverlay } from "./camera-overlay";
import { useMatchRecorder } from "./match-recorder-context";

/**
 * The framing hint under the ready preview, by copy id (timekeeper mode
 * ARCHITECTURE 2.3; the capture policy picks it). "rotate", the default and
 * today's hint, invites a sideways wide shot.
 */
const READY_HINTS = {
  rotate: {
    testID: "ready-rotate-hint",
    text: "Turn your phone sideways for a wide shot. It locks when the match starts.",
  },
} as const;

export type ReadyHintId = keyof typeof READY_HINTS;

/**
 * The camera viewfinder, hoisted out of the live step so one native
 * capture session spans the steps that need it.
 *
 * Mounted from the READY step rather than at match start (jits-2zpe).
 * `recordAsync` issued before the native session can actually record
 * throws "Camera is not ready yet", so the recorder carries a 3s
 * deferred-start backstop plus an 8s not-ready retry budget, and all of
 * that used to be spent AFTER the match clock had already started. With
 * the session warm through the ready check, `onCameraReady` has long since
 * fired by the time the match starts and the common path records on the
 * first attempt.
 *
 * Bounded on both ends on purpose. It does not mount on weight or before any
 * match step (practice's lobby and wait): those can sit open indefinitely
 * and a live capture session costs real battery. And it unmounts once the
 * recorder is past `stopping`, so nothing holds the camera open through
 * result entry.
 *
 * Note it does NOT provoke an earlier permission prompt: `CameraOverlay`
 * renders `CameraView` only once permission is already granted, and
 * otherwise renders the grant CTA. What moves earlier is the request, from
 * mid-match to the ready check, which is where a denial is still
 * recoverable.
 */
export function MatchRecorderCamera({
  step,
  optedIn = true,
  hintId = "rotate",
}: {
  /** The wizard's step; null before any match step (practice's lobby and wait). */
  step: MatchStep | null;
  /**
   * "Record from my phone" (the match face-off, decision 5). Default true
   * (practice). Off: no capture session at all on ready or live; the live
   * screen shows its no-video plate instead.
   */
  optedIn?: boolean;
  /** The framing hint under the ready preview. Default "rotate". */
  hintId?: ReadyHintId;
}) {
  const recorder = useMatchRecorder();
  const warming = step === "ready";
  // Live is full screen: the camera fills the screen at the recorded aspect
  // and the live step draws its chrome over it. Same element either way, so
  // the ready -> live handoff never remounts the capture session.
  const fullscreen = step === "live";
  const granted = recorder.permission?.granted ?? false;
  // Held past the live step while an explicit stop is still in flight:
  // tearing the capture session down mid-stop is how a clip ends up
  // finalized with no file. `stopping` is bounded by the recorder's stop
  // watchdog, so a stop the hardware drops cannot pin the viewfinder (and
  // the mic indicator) open over the result and summary steps.
  const mounted = (optedIn && (warming || step === "live")) || recorder.state === "stopping";

  // The recorder outlives this view now, so readiness and the pending
  // deferred-start backstop have to be torn down when the camera goes
  // away. Otherwise the backstop fires against a null cameraRef, the
  // recorder transitions to "Camera not ready", and the persistent chip
  // accuses the user of a camera failure for the rest of the wizard over
  // a match that merely ended inside the 3s timeout.
  const { releaseCamera } = recorder;
  React.useEffect(() => {
    if (!mounted) return;
    return () => releaseCamera();
  }, [mounted, releaseCamera]);

  if (!mounted) return null;

  return (
    <View
      className={fullscreen ? undefined : "w-full gap-2"}
      style={fullscreen ? StyleSheet.absoluteFill : undefined}
    >
      <CameraOverlay
        cameraRef={recorder.cameraRef}
        permissionGranted={granted}
        permissionCanAskAgain={recorder.permission?.canAskAgain ?? true}
        onRequestPermission={() => void recorder.requestPermission()}
        onCameraReady={recorder.markCameraReady}
        recording={recorder.state === "recording"}
        layout={fullscreen ? "fullscreen" : "card"}
      />
      {/* Only alongside an actual preview. Under the "camera access
          denied" card it would promise a recording that cannot happen. */}
      {warming && granted ? (
        <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
          Preview only. Recording starts with the match.
        </Text>
      ) : null}
      {/* The framing hint. By default rotation is the control: the ready
          check follows the phone and going live locks it
          (MatchOrientationController). */}
      {warming && granted ? (
        <Text testID={READY_HINTS[hintId].testID} className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
          {READY_HINTS[hintId].text}
        </Text>
      ) : null}
    </View>
  );
}
