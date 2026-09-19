import { Text, View } from "react-native";
import type { MatchStep } from "@/lib/match-flow/step-router";
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
  // Held past the live step while an explicit stop is still in flight:
  // tearing the capture session down mid-stop is how a clip ends up
  // finalized with no file.
  const mounted = warming || step === "live" || recorder.state === "stopping";
  if (!mounted) return null;

  return (
    <View className="w-full gap-2">
      <CameraOverlay
        cameraRef={recorder.cameraRef}
        permissionGranted={recorder.permission?.granted ?? false}
        permissionCanAskAgain={recorder.permission?.canAskAgain ?? true}
        onRequestPermission={() => void recorder.requestPermission()}
        onCameraReady={recorder.markCameraReady}
        recording={recorder.state === "recording"}
      />
      {warming ? (
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
export function MatchRecorderStatus() {
  const recorder = useMatchRecorder();
  return (
    <UploadProgressBanner
      state={recorder.state}
      error={recorder.error}
      truncation={recorder.truncation}
    />
  );
}
