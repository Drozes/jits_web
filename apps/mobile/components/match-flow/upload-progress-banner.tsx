import { ActivityIndicator, Text, View, type DimensionValue } from "react-native";
import { CheckCircle2, AlertTriangle, PauseCircle } from "lucide-react-native";
import { Button } from "@/components/ui/elo-system/button";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { usePalette } from "@/lib/theme/palette";
import { useNetworkStatus } from "@/lib/network/use-network-status";
import type { RecordingTruncation } from "@/lib/video/use-video-recorder";
import { uploadBannerActions, type UploadBannerState } from "@/lib/video/upload-banner-state";
import { isBackgroundUploadSupported } from "@/lib/video/upload-capabilities";
import { useUploadAnnouncements } from "@/lib/video/use-upload-announcements";
import { formatUploadSize, keepOpenCopy } from "@/lib/video/upload-copy";

/**
 * Exactly the state `deriveUploadBannerState` produces, plus the two
 * actions a paused or failed upload offers. The component decides no
 * precedence of its own: that lives in one testable table in
 * `lib/video/upload-banner-state.ts`, because the inputs come from two
 * places with different lifetimes (a view-bound recorder and a
 * match-keyed upload store that outlives it).
 */
type UploadProgressBannerProps = UploadBannerState & {
  /** Run the upload now (paused, or a failure a retry can fix). */
  onRetry?: () => void;
  /** Drop a recording that can never upload (terminal failure). */
  onDiscard?: () => void;
};

/** Copy for a clip that ended before the match did. */
export function truncationCopy(truncation: RecordingTruncation): string {
  return truncation === "limit"
    ? "Recording hit its time limit. The clip stops before the end of the match."
    : "Recording was interrupted. The clip stops before the end of the match.";
}

/**
 * `0.42` -> `"42%"`. Clamped because a server offset can overshoot, and
 * finite-checked because this string is also used as a layout `width`:
 * `"NaN%"` is a silent rendering failure rather than a visible one.
 */
function percentLabel(progress: number): string | null {
  if (!Number.isFinite(progress)) return null;
  return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
}

function Track({ pct, color }: { pct: string; color: string }) {
  // Hairline fill rather than a component: brand rules forbid elevation,
  // and a 2px track reads as data, not decoration.
  return (
    <View className="h-0.5 w-full bg-hairline-strong">
      <View testID="upload-progress-fill" className="h-full" style={{ width: pct as DimensionValue, backgroundColor: color }} />
    </View>
  );
}

function Actions({ state, onRetry, onDiscard }: { state: UploadBannerState; onRetry?: () => void; onDiscard?: () => void }) {
  const actions = uploadBannerActions(state);
  const retry = actions.retry && onRetry;
  const discard = actions.discard && onDiscard;
  if (!retry && !discard) return null;
  return (
    <View className="flex-row gap-2">
      {retry ? (
        <Button
          testID="upload-retry"
          variant="secondary"
          height={36}
          label={state.kind === "paused" ? "Retry now" : "Retry upload"}
          onPress={onRetry}
        />
      ) : null}
      {discard ? (
        <Button testID="upload-discard" variant="destructive" height={36} label="Discard recording" onPress={onDiscard} />
      ) : null}
    </View>
  );
}

/**
 * Recording / upload status card for the match flow.
 *
 * Shown on the verdict (the match-flow redesign moved it off every
 * post-live step). It reads the match-keyed upload store plus the live
 * recorder, never step state: the upload only starts after the live step
 * has unmounted, so a step-scoped surface could never report its outcome
 * (jits-od3). A stuck or failed upload is visible there, not silent.
 *
 * Shows a real percentage: `progress` is the fraction of the clip the
 * server has confirmed (tus PATCH offsets), with an indeterminate spinner
 * only before the first offset is known. No ETA: progress moves in 6 MiB
 * steps and stops dead whenever iOS suspends the app, so any estimate
 * would be wrong in exactly the cases the athlete looks at it.
 *
 * While uploading it says to keep the app open (jits-n2im.1; there is no
 * background upload until jits-n2im.9 ships) and, on cellular, how big the
 * clip is (jits-n2im.6). Paused (attention) and failed (negative) are
 * distinct (jits-n2im.3), each with its action. Announces changes on iOS,
 * where `accessibilityLiveRegion` does nothing (jits-5tj9.2).
 */
export function UploadProgressBanner({ onRetry, onDiscard, ...state }: UploadProgressBannerProps) {
  const tokens = useThemedTokens();
  const p = usePalette();
  const network = useNetworkStatus();
  useUploadAnnouncements(state);
  const { kind, message, truncation, progress } = state;

  if (kind === "hidden") return null;

  if (kind === "stopping" || kind === "uploading") {
    const pct = kind === "uploading" && progress != null ? percentLabel(progress) : null;
    const size = kind === "uploading" && network.type === "cellular" ? formatUploadSize(state.bytesTotal) : null;
    return (
      <View
        testID="upload-status-banner"
        accessibilityLiveRegion="polite"
        className="w-full gap-1.5 rounded-xs bg-surface-3 border border-hairline-strong px-3 py-2"
      >
        <View className="w-full flex-row items-center gap-2">
          <ActivityIndicator size="small" color={tokens.textSecondary} />
          <Text className="flex-1 font-mono tabular-nums text-micro text-ink-2 uppercase tracking-caps-l">
            {kind === "stopping" ? "Finishing recording..." : "Uploading match video..."}
          </Text>
          {pct ? (
            <Text testID="upload-progress-percent" className="font-mono text-micro text-ink-2 tabular-nums">
              {pct}
            </Text>
          ) : null}
        </View>
        {pct ? <Track pct={pct} color={tokens.textSecondary} /> : null}
        {kind === "uploading" ? (
          <Text testID="upload-keep-open" className="font-body text-small text-ink-2">
            {keepOpenCopy(isBackgroundUploadSupported())}
          </Text>
        ) : null}
        {size ? (
          <Text testID="upload-cellular-size" className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
            {`On cellular · ${size}`}
          </Text>
        ) : null}
      </View>
    );
  }

  if (kind === "paused") {
    const pct = progress != null ? percentLabel(progress) : null;
    return (
      <View
        testID="upload-status-banner"
        accessibilityLiveRegion="polite"
        className="w-full gap-1.5 rounded-xs bg-surface-3 border border-attention px-3 py-2"
      >
        <View className="w-full flex-row items-center gap-2">
          <PauseCircle size={14} color={p.amber} />
          <Text className="flex-1 font-mono tabular-nums text-micro text-attention uppercase tracking-caps-l">
            Upload paused
          </Text>
          {pct ? (
            <Text testID="upload-progress-percent" className="font-mono text-micro text-ink-2 tabular-nums">
              {pct}
            </Text>
          ) : null}
        </View>
        {pct ? <Track pct={pct} color={p.amber} /> : null}
        <Text testID="upload-status-message" className="font-body text-small text-ink-2" numberOfLines={3}>
          {message}
          {truncation ? ` ${truncationCopy(truncation)}` : ""}
        </Text>
        <Actions state={state} onRetry={onRetry} onDiscard={onDiscard} />
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
            className="flex-1 font-mono tabular-nums text-micro text-negative uppercase tracking-caps-l"
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
        className="w-full flex-row items-center gap-2 rounded-xs bg-surface-3 border border-hairline-strong px-3 py-2"
      >
        <CheckCircle2 size={14} color={tokens.textPrimary} />
        <Text className="font-mono tabular-nums text-micro text-ink uppercase tracking-caps-l">
          Match video uploaded
        </Text>
      </View>
    );
  }

  // Failed. The truncation is said here too (jits-5tj9.5): a short clip
  // whose upload then failed must not lose either fact.
  return (
    <View
      testID="upload-status-banner"
      accessibilityLiveRegion="polite"
      className="w-full gap-2 rounded-xs bg-surface-3 border border-negative px-3 py-2"
    >
      <View className="w-full flex-row items-center gap-2">
        <AlertTriangle size={14} color={tokens.stateNegative} />
        <Text
          className="flex-1 font-mono tabular-nums text-micro text-negative uppercase tracking-caps-l"
          numberOfLines={4}
        >
          {message ?? "Recording unavailable"}
          {truncation ? ` ${truncationCopy(truncation)}` : ""}
        </Text>
      </View>
      <Actions state={state} onRetry={onRetry} onDiscard={onDiscard} />
    </View>
  );
}
