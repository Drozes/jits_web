import { ActivityIndicator, Text, View } from "react-native";
import { CheckCircle2, AlertTriangle } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import type { RecordingTruncation } from "@/lib/video/use-video-recorder";
import type { UploadBannerState } from "@/lib/video/upload-banner-state";

/**
 * Exactly the state `deriveUploadBannerState` produces. The component
 * decides no precedence of its own: that lives in one testable table in
 * `lib/video/upload-banner-state.ts`, because the inputs come from two
 * places with different lifetimes (a view-bound recorder and a
 * match-keyed upload store that outlives it).
 */
type UploadProgressBannerProps = UploadBannerState;

/** Copy for a clip that ended before the match did. */
function truncationCopy(truncation: RecordingTruncation): string {
  return truncation === "limit"
    ? "Recording hit its time limit. The clip stops before the end of the match."
    : "Recording was interrupted. The clip stops before the end of the match.";
}

/**
 * Persistent recording / upload status chip for the match wizard.
 *
 * Rendered ONCE at the wizard level, not inside a step: the upload only
 * starts after the live step has unmounted, so a step-scoped banner could
 * never report its outcome (jits-od3). It stays on screen through end,
 * result, confirm and summary, so a stuck or failed upload is visible
 * instead of silent.
 *
 * Note: no percentage. The upload streams via `FileSystem.uploadAsync`,
 * which emits no progress events for `BINARY_CONTENT`; real progress needs
 * `createUploadTask` and is tracked separately (jits-l5eq). Indeterminate
 * but visible beats invisible.
 *
 * ELO design system: hairline plate with caps mono copy. Status color
 * follows positive / negative ink tokens.
 */
export function UploadProgressBanner({ kind, message, truncation }: UploadProgressBannerProps) {
  const tokens = useThemedTokens();

  if (kind === "hidden") return null;

  if (kind === "stopping" || kind === "uploading") {
    return (
      <View
        testID="upload-status-banner"
        accessibilityLiveRegion="polite"
        className="w-full flex-row items-center gap-2 rounded-xs bg-surface-3 border border-hairline-strong px-3 py-2"
      >
        <ActivityIndicator size="small" color={tokens.textSecondary} />
        <Text className="font-mono text-[10px] text-ink-2 uppercase tracking-caps-l">
          {kind === "stopping" ? "Finishing recording..." : "Uploading match video..."}
        </Text>
      </View>
    );
  }

  if (kind === "uploaded") {
    // Uploaded, but the clip is short: warn rather than congratulate.
    if (truncation) {
      return (
        <View
          testID="upload-status-banner"
          accessibilityLiveRegion="polite"
          className="w-full flex-row items-center gap-2 rounded-xs bg-surface-3 border border-negative px-3 py-2"
        >
          <AlertTriangle size={14} color={tokens.stateNegative} />
          <Text
            className="flex-1 font-mono text-[10px] text-negative uppercase tracking-caps-l"
            numberOfLines={3}
          >
            Video uploaded. {truncationCopy(truncation)}
          </Text>
        </View>
      );
    }
    return (
      <View
        testID="upload-status-banner"
        accessibilityLiveRegion="polite"
        className="w-full flex-row items-center gap-2 rounded-xs bg-surface-3 border border-positive px-3 py-2"
      >
        <CheckCircle2 size={14} color={tokens.statePositive} />
        <Text className="font-mono text-[10px] text-positive uppercase tracking-caps-l">
          Match video uploaded
        </Text>
      </View>
    );
  }

  return (
    <View
      testID="upload-status-banner"
      accessibilityLiveRegion="polite"
      className="w-full flex-row items-center gap-2 rounded-xs bg-surface-3 border border-negative px-3 py-2"
    >
      <AlertTriangle size={14} color={tokens.stateNegative} />
      <Text
        className="flex-1 font-mono text-[10px] text-negative uppercase tracking-caps-l"
        numberOfLines={3}
      >
        {message ?? "Recording unavailable"}
      </Text>
    </View>
  );
}
