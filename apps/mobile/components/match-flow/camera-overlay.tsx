import * as React from "react";
import { Text, View } from "react-native";
import { CameraView } from "expo-camera";
import { Camera, CameraOff } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";

interface CameraOverlayProps {
  cameraRef: React.MutableRefObject<CameraView | null>;
  permissionGranted: boolean;
  permissionCanAskAgain: boolean;
  onRequestPermission: () => void;
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
 */
export function CameraOverlay({
  cameraRef,
  permissionGranted,
  permissionCanAskAgain,
  onRequestPermission,
  recording,
}: CameraOverlayProps) {
  const tokens = useThemedTokens();

  if (!permissionGranted) {
    return (
      <View className="w-full overflow-hidden rounded-xl border border-border bg-muted/40 p-4">
        <View className="flex-row items-center gap-3">
          <CameraOff size={20} color={tokens.mutedForeground} />
          <View className="flex-1">
            <Text className="text-sm font-medium text-foreground">
              {permissionCanAskAgain ? "Camera access needed" : "Camera access denied"}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {permissionCanAskAgain
                ? "Grant access to record this match. The match will run regardless."
                : "Enable camera access in Settings to record this match."}
            </Text>
          </View>
        </View>
        {permissionCanAskAgain ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 self-start"
            onPress={onRequestPermission}
            leftIcon={<Camera size={14} color={tokens.foreground} />}
          >
            Grant access
          </Button>
        ) : null}
      </View>
    );
  }

  return (
    <View className="w-full overflow-hidden rounded-xl border border-border bg-black">
      <View className="aspect-video w-full">
        <CameraView
          ref={cameraRef}
          mode="video"
          facing="back"
          style={{ flex: 1 }}
          videoQuality="720p"
        />
        {recording ? (
          <View className="absolute right-2 top-2 flex-row items-center gap-1.5 rounded-full bg-black/60 px-2 py-1">
            <View className={cn("h-2 w-2 rounded-full bg-destructive")} />
            <Text className="text-[10px] font-heading uppercase tracking-wider text-white">REC</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
