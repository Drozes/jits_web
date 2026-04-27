import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { CheckCircle2, AlertTriangle } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import type { RecordingState } from "@/lib/video/use-video-recorder";

interface UploadProgressBannerProps {
  state: RecordingState;
  error: string | null;
}

/**
 * Compact status pill rendered below the live controls. Surfaces
 * recording / upload state to the user without taking real estate
 * away from the timer + buttons.
 *
 * Note: `progress` is intentionally not displayed -- our upload
 * implementation streams via `FileSystem.uploadAsync` which does not
 * emit incremental progress for `BINARY_CONTENT`. We show a spinner
 * while uploading and switch to a checkmark when the POST resolves.
 */
export function UploadProgressBanner({ state, error }: UploadProgressBannerProps) {
  const tokens = useThemedTokens();

  if (state === "idle" || state === "recording") return null;

  if (state === "stopping" || state === "uploading") {
    return (
      <View className="flex-row items-center gap-2 rounded-md bg-muted px-3 py-2">
        <ActivityIndicator size="small" color={tokens.foreground} />
        <Text className="text-xs text-muted-foreground">
          {state === "stopping" ? "Finishing recording..." : "Uploading match video..."}
        </Text>
      </View>
    );
  }

  if (state === "uploaded") {
    return (
      <View className="flex-row items-center gap-2 rounded-md bg-success/10 px-3 py-2">
        <CheckCircle2 size={14} color={tokens.success} />
        <Text className="text-xs text-success">Match video uploaded</Text>
      </View>
    );
  }

  if (state === "error") {
    return (
      <View className="flex-row items-center gap-2 rounded-md bg-destructive/10 px-3 py-2">
        <AlertTriangle size={14} color={tokens.destructive} />
        <Text className="flex-1 text-xs text-destructive" numberOfLines={2}>
          {error ?? "Recording unavailable"}
        </Text>
      </View>
    );
  }

  return null;
}
