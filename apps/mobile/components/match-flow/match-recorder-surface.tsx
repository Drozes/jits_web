import * as React from "react";
import { Text, View } from "react-native";
import type { MatchStep } from "@/lib/match-flow/step-router";
import { useMatchUpload } from "@/lib/video/match-upload-store";
import { deriveUploadBannerState } from "@/lib/video/upload-banner-state";
import { CameraOverlay } from "./camera-overlay";
import { UploadProgressBanner } from "./upload-progress-banner";
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
export function MatchRecorderCamera({ step }: { step: MatchStep }) {
  const recorder = useMatchRecorder();
  const warming = step === "ready";
  const granted = recorder.permission?.granted ?? false;
  // Held past the live step while an explicit stop is still in flight:
  // tearing the capture session down mid-stop is how a clip ends up
  // finalized with no file. `stopping` is bounded by the recorder's stop
  // watchdog, so a stop the hardware drops cannot pin the viewfinder (and
  // the mic indicator) open over the result and summary steps.
  const mounted = warming || step === "live" || recorder.state === "stopping";

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
    <View className="w-full gap-2">
      <CameraOverlay
        cameraRef={recorder.cameraRef}
        permissionGranted={granted}
        permissionCanAskAgain={recorder.permission?.canAskAgain ?? true}
        onRequestPermission={() => void recorder.requestPermission()}
        onCameraReady={recorder.markCameraReady}
        recording={recorder.state === "recording"}
      />
      {/* Only alongside an actual preview. Under the "camera access
          denied" card it would promise a recording that cannot happen. */}
      {warming && granted ? (
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          Preview only. Recording starts with the match.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The persistent recording / upload status chip (jits-od3).
 *
 * Rendered once by the wizard, above the step, so it is on screen for
 * every step from live through summary. Its whole reason to exist is that
 * the upload starts after the live step has already unmounted, so a banner
 * scoped to that step can never report the upload's outcome, least of all
 * a failure.
 */
export function MatchRecorderStatus({ matchId }: { matchId: string }) {
  const recorder = useMatchRecorder();
  // The upload's outcome comes from the match-keyed store, not from the
  // recorder: the recorder is idle again after any remount, and an upload
  // that finishes late writes to the store long after the instance that
  // started it is gone. Reading the recorder here is what made the failure
  // silent in the first place.
  const upload = useMatchUpload(matchId);
  const banner = deriveUploadBannerState(recorder.state, recorder.error, upload);
  return <UploadProgressBanner {...banner} />;
}
