import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MatchStep } from "@/lib/match-flow/step-router";
import { CameraOverlay } from "./camera-overlay";
import { useMatchRecorder } from "./match-recorder-context";

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
 * Bounded on both ends on purpose. It does not mount on wait or weight
 * (those steps can sit open indefinitely and a live capture session costs
 * real battery), and it unmounts once the recorder is past `stopping`, so
 * nothing holds the camera open through result entry.
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
}: {
  step: MatchStep;
  /**
   * "Record from my phone" (the match face-off, decision 5). Default true
   * (practice). Off: no capture session at all on ready or live; the live
   * screen shows its no-video plate instead.
   */
  optedIn?: boolean;
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
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          Preview only. Recording starts with the match.
        </Text>
      ) : null}
      {/* Rotation is the control: the ready check follows the phone and
          going live locks it (MatchOrientationController). */}
      {warming && granted ? (
        <Text testID="ready-rotate-hint" className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          Turn your phone sideways for a wide shot. It locks when the match starts.
        </Text>
      ) : null}
    </View>
  );
}
