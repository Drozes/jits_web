import * as React from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { CameraView } from "expo-camera";
import { Camera, CameraOff } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";
import { fitRecordedFrame } from "@/lib/video/recorded-frame";

/** Solid ground behind the live screen when there is no camera feed. */
const NO_FEED_GROUND = "#0D0F14";

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
   * `card`: the 16:9 viewfinder card (ready step). `fullscreen`: the live
   * step, full screen on black at the recorded 9:16 aspect, with the live
   * chrome drawn over it by the step. The element nesting around
   * `CameraView` is identical in both, so switching never remounts the
   * native capture session.
   */
  layout?: "card" | "fullscreen";
}

/**
 * Small camera viewfinder used by the live match step. Mounted as a
 * thumbnail above the timer + controls so the user can verify the shot
 * without obscuring the match UI.
 *
 * When permission is missing we render a placeholder + grant CTA in
 * the same slot. The match flow continues regardless: recording is
 * best-effort.
 *
 * Deliberately NO "Open Settings" button once iOS has recorded a denial.
 * iOS terminates the app when a camera or microphone privacy switch
 * changes, and this card only ever renders inside the match wizard (ready
 * and live steps), so a Settings round trip kills the app mid-match and
 * strands the athlete. The denied card says so instead and points them at
 * Settings for their NEXT match.
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
}: CameraOverlayProps) {
  const tokens = useThemedTokens();
  const window = useWindowDimensions();
  const fullscreen = layout === "fullscreen";

  if (!permissionGranted && fullscreen) {
    // The live screen draws the no-video plate and the Allow Camera action.
    return (
      <View
        testID="camera-no-feed-ground"
        style={[StyleSheet.absoluteFill, { backgroundColor: NO_FEED_GROUND }]}
      />
    );
  }

  if (!permissionGranted) {
    return (
      <View className="w-full overflow-hidden rounded-md border border-hairline-strong bg-surface-3 p-4">
        <View className="flex-row items-center gap-3">
          <CameraOff size={20} color={tokens.textSecondary} />
          <View className="flex-1">
            <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">
              {permissionCanAskAgain ? "Camera access needed" : "Camera access denied"}
            </Text>
            <Text className="mt-1 font-body text-[12px] text-ink-2">
              {permissionCanAskAgain
                ? "Grant access to record this match. The match will run regardless."
                : "This match will not be recorded and runs as normal. To record your next match, enable camera and microphone access in Settings after this one. Changing them restarts the app."}
            </Text>
          </View>
        </View>
        {permissionCanAskAgain ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRequestPermission}
            hitSlop={10}
            className="mt-3 self-start flex-row items-center gap-2 border border-hairline-strong rounded-xs bg-surface-3 px-3 py-2 active:bg-surface-4"
          >
            <Camera size={14} color={tokens.textPrimary} />
            <Text className="font-heading text-[10px] text-ink uppercase tracking-caps">
              Grant Access
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const frame = fullscreen ? fitRecordedFrame(window.width, window.height) : null;
  return (
    <View
      className={
        fullscreen ? undefined : "w-full overflow-hidden rounded-md border border-hairline-strong bg-black"
      }
      style={fullscreen ? [StyleSheet.absoluteFill, { backgroundColor: "#000000", overflow: "hidden" }] : undefined}
    >
      <View
        testID="camera-frame"
        className={fullscreen ? undefined : "aspect-video w-full"}
        style={
          frame
            ? { position: "absolute", width: frame.width, height: frame.height, left: frame.left, top: frame.top }
            : undefined
        }
      >
        <CameraView
          ref={cameraRef}
          mode="video"
          facing="back"
          style={{ flex: 1 }}
          videoQuality="720p"
          onCameraReady={onCameraReady}
        />
        {recording && !fullscreen ? (
          <View className="absolute right-2 top-2 flex-row items-center gap-1.5 rounded-xs bg-black/60 px-2 py-1">
            <View className={cn("h-2 w-2 rounded-full bg-cta")} />
            <Text className="font-mono-bold text-[10px] uppercase tracking-caps-l text-white">
              REC
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
