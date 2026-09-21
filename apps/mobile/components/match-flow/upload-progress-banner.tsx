import { ActivityIndicator, Text, View, type DimensionValue } from "react-native";
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
 * Shows a real percentage. The upload is a resumable tus transfer whose
 * PATCH responses carry a server-confirmed byte offset, so `progress` is
 * the fraction the server has actually accepted, not a guess. It falls
 * back to the old indeterminate spinner only before the first offset is
 * known, which is the one moment there is genuinely nothing to report.
 * (The previous `FileSystem.uploadAsync(BINARY_CONTENT)` path emitted no
 * progress events at all, so a ten-minute upload was a bare spinner.)
 *
 * ELO design system: hairline plate with caps mono copy. Status color
 * follows positive / negative ink tokens.
 */
/**
 * `0.42` -> `"42%"`. Clamped because a server offset can overshoot, and
 * finite-checked because this string is also used as a layout `width`:
 * `"NaN%"` is a silent rendering failure rather than a visible one.
 */
function percentLabel(progress: number): string | null {
  if (!Number.isFinite(progress)) return null;
  return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
}

export function UploadProgressBanner({
  kind,
  message,
  truncation,
  progress,
}: UploadProgressBannerProps) {
  const tokens = useThemedTokens();

  if (kind === "hidden") return null;

  if (kind === "stopping" || kind === "uploading") {
    const pct = kind === "uploading" && progress != null ? percentLabel(progress) : null;
    return (
      <View
        testID="upload-status-banner"
        accessibilityLiveRegion="polite"
        className="w-full gap-1.5 rounded-xs bg-surface-3 border border-hairline-strong px-3 py-2"
      >
        <View className="w-full flex-row items-center gap-2">
          <ActivityIndicator size="small" color={tokens.textSecondary} />
          <Text className="flex-1 font-mono text-[10px] text-ink-2 uppercase tracking-caps-l">
            {kind === "stopping" ? "Finishing recording..." : "Uploading match video..."}
          </Text>
          {pct ? (
            <Text
              testID="upload-progress-percent"
              className="font-mono text-[10px] text-ink-2 tabular-nums"
            >
              {pct}
            </Text>
          ) : null}
        </View>
        {/* Hairline fill rather than a component: brand rules forbid
            elevation, and a 2px track reads as data, not decoration. */}
        {pct ? (
          <View className="h-0.5 w-full bg-hairline-strong">
            <View
              testID="upload-progress-fill"
              className="h-full bg-ink-2"
              style={{ width: pct as DimensionValue }}
            />
          </View>
        ) : null}
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
