import * as React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { MatchStep } from "@/lib/match-flow/step-router";
import { readyPreviewShapeFor, type CapturePolicy } from "@/lib/match-flow/capture-policy";
import { CAPTURE_COPY, readyHintFor, type ReadyHintId } from "@/lib/video/capture-copy";
import { readyPreviewBox } from "@/lib/video/recorded-frame";
import { useCaptureLens } from "@/lib/video/select-capture-lens";
import { useCaptureQuality } from "@/lib/video/use-capture-quality";
import { CameraOverlay, type Viewfinder } from "./camera-overlay";
import { useMatchRecorder, useMatchRecordingCapture } from "./match-recorder-context";

/** The framing hint under the ready preview (the match-loop label contract reads it by this id). */
export const READY_HINT_TEST_ID = "ready-capture-hint";

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
 *
 * What it records with comes from the capture policy (timekeeper mode spec
 * 13, A21 to A23): the preview frame and the hint follow the orientation, the
 * lens follows the role's preference, and the quality is the admin flag. All
 * of it settles on the ready step and is frozen once the match is live. The
 * 9:16 card keeps its two lines beside it, so the block is never taller than
 * the shipped 16:9 card and its lines were (`recordedReadyCardWidth`).
 */
export function MatchRecorderCamera({
  step,
  optedIn = true,
  capture,
}: {
  /** The wizard's step; null before any match step (practice's lobby and wait). */
  step: MatchStep | null;
  /**
   * "Record from my phone" (the match face-off, decision 5). Default true
   * (practice). Off: no capture session at all on ready or live; the live
   * screen shows its no-video plate instead.
   */
  optedIn?: boolean;
  /** This viewer's capture policy (`capturePolicyFor`, or `PRACTICE_CAPTURE`). */
  capture: CapturePolicy;
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
  const { viewfinder, lens, onCameraReady } = useViewfinderCapture(recorder, capture, step, {
    optedIn,
    cameraUp: mounted && granted,
  });

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
  // Only alongside an actual preview. Under the "camera access denied" card
  // they would promise a recording that cannot happen.
  const notes = warming && granted;
  const beside = notes && viewfinder.card.notes === "beside";
  // The timekeeper's hint waits for the lens lookup, so an iPhone with an
  // ultrawide never shows the step-back hint first.
  const hint = lens.settled ? readyHintFor(capture, lens.lens) : null;

  return (
    <View
      className={fullscreen ? undefined : beside ? "w-full flex-row gap-3" : "w-full gap-2"}
      style={fullscreen ? StyleSheet.absoluteFill : undefined}
    >
      <CameraOverlay
        cameraRef={recorder.cameraRef}
        permissionGranted={granted}
        permissionCanAskAgain={recorder.permission?.canAskAgain ?? true}
        onRequestPermission={() => void recorder.requestPermission()}
        onCameraReady={onCameraReady}
        recording={recorder.state === "recording"}
        layout={fullscreen ? "fullscreen" : "card"}
        viewfinder={viewfinder}
      />
      {notes ? <ReadyNotes hint={hint} beside={beside} /> : null}
    </View>
  );
}

/**
 * The ready preview's lines: the preview notice and the framing hint
 * (TK-REC1, TK-REC1b or TK-REC2; portrait guidance, the interface itself
 * stays upright, `MatchOrientationController`). Beside the narrow 9:16 card,
 * else under the card.
 */
function ReadyNotes({ hint, beside }: { hint: ReadyHintId | null; beside: boolean }) {
  const lines = (
    <>
      <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
        Preview only. Recording starts with the match.
      </Text>
      {hint ? (
        <Text testID={READY_HINT_TEST_ID} className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
          {CAPTURE_COPY[hint]}
        </Text>
      ) : null}
    </>
  );
  return beside ? (
    <View testID="ready-notes-beside" className="flex-1 gap-2">
      {lines}
    </View>
  ) : (
    lines
  );
}

/**
 * The quality and lens this viewfinder records with, reported to the
 * recorder for the video row, and the ready card it draws. Both settle during
 * the face-off and freeze from the live step (or a clip in progress) on:
 * either change reconfigures the capture session, which must never happen
 * under a recording. The flag is read only for a viewer who records.
 */
function useViewfinderCapture(
  recorder: ReturnType<typeof useMatchRecorder>,
  capture: CapturePolicy,
  step: MatchStep | null,
  { optedIn, cameraUp }: { optedIn: boolean; cameraUp: boolean },
) {
  const window = useWindowDimensions();
  const locked = step === "live" || recorder.state === "recording" || recorder.state === "stopping";
  const faceoff = step === "weight" || step === "ready" || step === "live";
  const videoQuality = useCaptureQuality(faceoff && optedIn, locked);
  const lens = useCaptureLens(capture.captureLens, recorder.cameraRef, cameraUp, locked);

  const captureRef = useMatchRecordingCapture();
  React.useEffect(() => {
    captureRef.current = { quality: videoQuality, lens: lens.lens };
  }, [captureRef, videoQuality, lens.lens]);

  // The recorder's readiness first (a deferred start resumes there), then
  // the lens lookup, which needs the native view registered.
  const { markCameraReady } = recorder;
  const lensCameraReady = lens.onCameraReady;
  const onCameraReady = React.useCallback(() => {
    markCameraReady();
    lensCameraReady();
  }, [markCameraReady, lensCameraReady]);

  const viewfinder: Viewfinder = {
    card: readyPreviewBox(window.width, window.height, readyPreviewShapeFor(capture.recordingOrientation)),
    videoQuality,
    selectedLens: lens.selectedLens,
    wideLens: lens.lens === "ultrawide",
  };
  return { viewfinder, lens, onCameraReady };
}
