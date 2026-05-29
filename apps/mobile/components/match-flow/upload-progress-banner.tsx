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
 * Note: `progress` is intentionally not displayed. Our upload
 * implementation streams via `FileSystem.uploadAsync` which does not
 * emit incremental progress for `BINARY_CONTENT`. We show a spinner
 * while uploading and switch to a checkmark when the POST resolves.
 *
 * ELO design system: hairline plate with caps mono copy. Status color
 * follows positive / negative ink tokens.
 */
export function UploadProgressBanner({ state, error }: UploadProgressBannerProps) {
  const tokens = useThemedTokens();

  if (state === "idle" || state === "recording") return null;

  if (state === "stopping" || state === "uploading") {
    return (
      <View className="flex-row items-center gap-2 rounded-xs bg-surface-3 border border-hairline-strong px-3 py-2">
        <ActivityIndicator size="small" color={tokens.textSecondary} />
        <Text className="font-mono text-[10px] text-ink-2 uppercase tracking-caps-l">
          {state === "stopping" ? "Finishing recording..." : "Uploading match video..."}
        </Text>
      </View>
    );
  }

  if (state === "uploaded") {
    return (
      <View className="flex-row items-center gap-2 rounded-xs bg-surface-3 border border-positive px-3 py-2">
        <CheckCircle2 size={14} color={tokens.statePositive} />
        <Text className="font-mono text-[10px] text-positive uppercase tracking-caps-l">
          Match video uploaded
        </Text>
      </View>
    );
  }

  if (state === "error") {
    return (
      <View className="flex-row items-center gap-2 rounded-xs bg-surface-3 border border-negative px-3 py-2">
        <AlertTriangle size={14} color={tokens.stateNegative} />
        <Text
          className="flex-1 font-mono text-[10px] text-negative uppercase tracking-caps-l"
          numberOfLines={2}
        >
          {error ?? "Recording unavailable"}
        </Text>
      </View>
    );
  }

  return null;
}
