import * as React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { CameraView } from "expo-camera";
import { Camera, CameraOff } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";
import { fitRecordedFrame, type ReadyPreviewBox } from "@/lib/video/recorded-frame";
import { CAPTURE_COPY } from "@/lib/video/capture-copy";
import type { MatchVideoCaptureQuality } from "@jits/shared/api/match-video-upload";
import { BROADCAST } from "./live/broadcast-tokens";
import { onMediaTokens } from "@/lib/tokens";
import { Button } from "@/components/ui/elo-system/button";

interface CameraOverlayProps {
  cameraRef: React.MutableRefObject<CameraView | null>;
  permissionGranted: boolean;
  permissionCanAskAgain: boolean;
  onRequestPermission: () => void;
  /** Fired by expo-camera once the native capture session is live.
   * recordAsync before this throws "Camera is not ready yet". */
  onCameraReady: () => void;
  recording: boolean;
  /**
   * `card`: the viewfinder card (ready step). `fullscreen`: the live
   * step, full screen on black at the recorded aspect (9:16 portrait, 16:9
   * landscape), with the live
   * chrome drawn over it by the step. The element nesting around
   * `CameraView` is identical in both, so switching never remounts the
   * native capture session.
   */
  layout?: "card" | "fullscreen";
  /** What it shows and records with. */
  viewfinder: Viewfinder;
}

/**
 * What the viewfinder shows and records with: `MatchRecorderCamera` builds it
 * once from the capture policy (timekeeper mode spec 13, A21 to A23).
 */
export interface Viewfinder {
  /** The ready card (`readyPreviewBox`: the recorded 9:16 or the wide 16:9); live ignores it. */
  card: ReadyPreviewBox;
  /** The capture quality (`use-capture-quality.ts`, the admin flag). */
  videoQuality: MatchVideoCaptureQuality;
  /**
   * The recording bitrate in bits per second (`use-capture-bitrate.ts`);
   * undefined is the platform default. Frozen with the quality: a change
   * recreates the Android camera.
   */
  videoBitrate: number | undefined;
  /** The back lens by name (`select-capture-lens.ts`, iOS); undefined is the default lens. */
  selectedLens: string | undefined;
  /** Tag the card TK-REC3 `WIDE LENS` (the ultrawide is selected). */
  wideLens: boolean;
}

/**
 * Small camera viewfinder used by the live match step. Mounted as a
 * thumbnail above the timer + controls so the user can verify the shot
 * without obscuring the match UI.
 *
 * When permission is missing we render a placeholder + grant CTA in
 * the same slot (`CameraPermissionCard`, which never offers Settings
 * mid-match). The match flow continues regardless: recording is
 * best-effort.
 *
 * ELO design system: tk-viewfinder style. The recording REC pill uses
 * the negative/CTA dot to match the wireframe.
 */
export function CameraOverlay({
  cameraRef,
  permissionGranted,
  permissionCanAskAgain,
  onRequestPermission,
  onCameraReady,
  recording,
  layout = "card",
  viewfinder,
}: CameraOverlayProps) {
  const window = useWindowDimensions();
  const fullscreen = layout === "fullscreen";

  if (!permissionGranted && fullscreen) {
    // The live screen draws the no-video plate and the Allow Camera action.
    return (
      <View
        testID="camera-no-feed-ground"
        style={[StyleSheet.absoluteFill, { backgroundColor: BROADCAST.ground }]}
      />
    );
  }

  if (!permissionGranted) {
    return <CameraPermissionCard canAskAgain={permissionCanAskAgain} onRequestPermission={onRequestPermission} />;
  }

  const frame = fullscreen ? fitRecordedFrame(window.width, window.height) : null;
  // The ready card: the recorded 9:16 frame at the row's start (its lines sit
  // beside it) under the portrait capture policy; the full-width 16:9 card
  // otherwise; in a landscape window a narrower centered 16:9 card so the
  // Ready controls stay in reach. Same nesting, so no remount.
  const card = fullscreen ? null : viewfinder.card;
  const cardWidth = card?.width ?? null;
  const cardAlign = card?.notes === "beside" ? "flex-start" : "center";
  return (
    <View
      testID="camera-card"
      className={
        fullscreen
          ? undefined
          : cn(cardWidth == null && "w-full", "overflow-hidden rounded-md border border-hairline-strong")
      }
      style={
        fullscreen
          ? [StyleSheet.absoluteFill, { backgroundColor: BROADCAST.black, overflow: "hidden" }]
          : cardWidth != null
            ? { width: cardWidth, maxWidth: "100%", alignSelf: cardAlign, backgroundColor: BROADCAST.black }
            : { backgroundColor: BROADCAST.black }
      }
    >
      <View
        testID="camera-frame"
        className={fullscreen ? undefined : "w-full"}
        style={
          frame
            ? { position: "absolute", width: frame.width, height: frame.height, left: frame.left, top: frame.top }
            : { aspectRatio: card?.aspectRatio }
        }
      >
        <CameraView
          ref={cameraRef}
          mode="video"
          facing="back"
          style={{ flex: 1 }}
          videoQuality={viewfinder.videoQuality}
          videoBitrate={viewfinder.videoBitrate}
          selectedLens={viewfinder.selectedLens}
          onCameraReady={onCameraReady}
        />
        {viewfinder.wideLens && !fullscreen ? <WideLensTag /> : null}
        {recording && !fullscreen ? (
          // On-media text sits on the badge fill (the on-media contrast rule).
          <View
            className="absolute right-2 top-2 flex-row items-center gap-1.5 rounded-xs px-2 py-1"
            style={{ backgroundColor: onMediaTokens.badge }}
          >
            <View className={cn("h-2 w-2 rounded-full bg-cta")} />
            <Text className="font-mono-bold tabular-nums text-micro uppercase tracking-caps-l" style={{ color: BROADCAST.white }}>
              REC
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** TK-REC3 on the timekeeper's preview while the ultrawide is selected (A21), on the badge fill. */
function WideLensTag() {
  const tag = CAPTURE_COPY["TK-REC3"];
  return (
    <View
      testID="camera-wide-lens-tag"
      accessible
      accessibilityLabel={tag.a11y}
      className="absolute left-2 top-2 rounded-xs px-2 py-1"
      style={{ backgroundColor: onMediaTokens.badge }}
    >
      <Text className="font-mono-bold tabular-nums text-micro uppercase tracking-caps-l" style={{ color: BROADCAST.white }}>
        {tag.text}
      </Text>
    </View>
  );
}

/**
 * The ready step's slot without camera permission: a grant CTA while the OS
 * will still prompt, else the denied copy.
 *
 * Deliberately NO "Open Settings" button once iOS has recorded a denial.
 * iOS terminates the app when a camera or microphone privacy switch
 * changes, and this card only ever renders inside the match wizard (ready
 * and live steps), so a Settings round trip kills the app mid-match and
 * strands the athlete. The denied card says so instead and points them at
 * Settings for their NEXT match.
 */
function CameraPermissionCard({
  canAskAgain,
  onRequestPermission,
}: {
  canAskAgain: boolean;
  onRequestPermission: () => void;
}) {
  const tokens = useThemedTokens();
  return (
    <View className="w-full overflow-hidden rounded-md border border-hairline-strong bg-surface-3 p-4">
      <View className="flex-row items-center gap-3">
        <CameraOff size={20} color={tokens.textSecondary} />
        <View className="flex-1">
          <Text className="font-heading text-small text-ink uppercase tracking-caps">
            {canAskAgain ? "Camera access needed" : "Camera access denied"}
          </Text>
          <Text className="mt-1 font-body text-small text-ink-2">
            {canAskAgain
              ? "Grant access to record this match. The match will run regardless."
              : "This match will not be recorded and runs as normal. To record your next match, enable camera and microphone access in Settings after this one. Changing them restarts the app."}
          </Text>
        </View>
      </View>
      {canAskAgain ? (
        <Button
          variant="secondary"
          label="Grant Access"
          height={36}
          hitSlop={10}
          className="mt-3 self-start"
          onPress={onRequestPermission}
          icon={(color) => <Camera size={14} color={color} />}
        />
      ) : null}
    </View>
  );
}
