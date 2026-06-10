import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { CameraView } from "expo-camera";
import { Camera, CameraOff } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";

interface CameraOverlayProps {
  cameraRef: React.MutableRefObject<CameraView | null>;
  permissionGranted: boolean;
  permissionCanAskAgain: boolean;
  onRequestPermission: () => void;
  /** Fired by expo-camera once the native capture session is live.
   * recordAsync before this throws "Camera is not ready yet". */
  onCameraReady: () => void;
  recording: boolean;
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
}: CameraOverlayProps) {
  const tokens = useThemedTokens();

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
                : "Enable camera access in Settings to record this match."}
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

  return (
    <View className="w-full overflow-hidden rounded-md border border-hairline-strong bg-black">
      <View className="aspect-video w-full">
        <CameraView
          ref={cameraRef}
          mode="video"
          facing="back"
          style={{ flex: 1 }}
          videoQuality="720p"
          onCameraReady={onCameraReady}
        />
        {recording ? (
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
