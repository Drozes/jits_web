import { ActivityIndicator, Text, View, type DimensionValue } from "react-native";
import { CheckCircle2, AlertTriangle, PauseCircle } from "lucide-react-native";
import { Button } from "@/components/ui/elo-system/button";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { usePalette } from "@/lib/theme/palette";
import { useNetworkStatus } from "@/lib/network/use-network-status";
import type { RecordingTruncation } from "@/lib/video/use-video-recorder";
import { uploadBannerActions, uploadBannerTone, type UploadBannerState } from "@/lib/video/upload-banner-state";
import { isBackgroundUploadSupported } from "@/lib/video/upload-capabilities";
import { useUploadAnnouncements } from "@/lib/video/use-upload-announcements";
import { DISCARD_LABEL, TRY_AGAIN_A11Y, TRY_AGAIN_LABEL } from "@/lib/video/use-upload-actions";
import { formatUploadSize, keepOpenCopy, UPLOAD_TAG } from "@/lib/video/upload-copy";

/**
 * Exactly the state `deriveUploadBannerState` produces, plus the two
 * actions a paused or failed upload offers. The component decides no
 * precedence of its own: that lives in one testable table in
 * `lib/video/upload-banner-state.ts`.
 */
type UploadProgressBannerProps = UploadBannerState & {
  /** Run the upload now (paused, or a failure a retry can fix). */
  onRetry?: () => void;
  /** Drop a recording that can never upload (terminal failure, clip on the phone). */
  onDiscard?: () => void;
};

/** Copy for a clip that ended before the match did. */
export function truncationCopy(truncation: RecordingTruncation): string {
  return truncation === "limit"
    ? "Recording hit its time limit. The clip stops before the end of the match."
    : "Recording was interrupted. The clip stops before the end of the match.";
}

/** Every new control is 44 px tall (deck convention 10). */
const CONTROL_HEIGHT = 44;

/**
 * `0.42` -> `"42%"`. Clamped because a server offset can overshoot, and
 * finite-checked because this string is also used as a layout `width`.
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

function Helper({ children, testID }: { children: React.ReactNode; testID?: string }) {
  // Helper strings render as written (Inter), never in mono caps (deck 0.1).
  return (
    <Text testID={testID} className="font-body text-small text-ink-2">
      {children}
    </Text>
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
          height={CONTROL_HEIGHT}
          label={TRY_AGAIN_LABEL}
          accessibilityLabel={TRY_AGAIN_A11Y}
          onPress={onRetry}
        />
      ) : null}
      {discard ? (
        // A quiet secondary action, never red: the state has nothing urgent.
        <Button testID="upload-discard" variant="ghost" height={CONTROL_HEIGHT} label={DISCARD_LABEL} onPress={onDiscard} />
      ) : null}
    </View>
  );
}

/**
 * Recording / upload status card for the verdict and the match page.
 *
 * Reads the match-keyed upload store plus the live recorder, never step
 * state (jits-od3). Strings, tags and colors follow the reviewed copy deck
 * (`design/native-screens/proposals/2026-10-04-video-status/COPY-DECK.md`,
 * sections 2a, 3, 8 and 10):
 *   uploading  tag "Uploading match video" + {pct}%, keep-open helper; on
 *              cellular, the clip size (jits-n2im.6)
 *   paused     attention, tag "Upload paused", the cause, Try again
 *   failed     red ("act") only when Try again can work; a failure nobody
 *              can fix is grey ("info"), with a quiet Discard when the clip
 *              is still on the phone
 * No ETA: progress moves in 6 MiB steps and stops whenever iOS suspends
 * the app. No live region (deck 10.1): the card announces state changes
 * itself, from the focused screen only (jits-5tj9.2).
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
    const tag = kind === "stopping" ? UPLOAD_TAG.stopping : UPLOAD_TAG.uploading;
    return (
      <View
        testID="upload-status-banner"
        accessibilityRole={kind === "uploading" ? "progressbar" : undefined}
        accessibilityLabel={pct ? `${tag}, ${Math.round((progress ?? 0) * 100)} percent` : tag}
        accessibilityValue={kind === "uploading" && pct ? { min: 0, max: 100, now: Math.round((progress ?? 0) * 100) } : undefined}
        className="w-full gap-1.5 rounded-xs bg-surface-3 border border-hairline-strong px-3 py-2"
      >
        <View className="w-full flex-row items-center gap-2">
          <ActivityIndicator size="small" color={tokens.textSecondary} />
          <Text className="flex-1 font-mono tabular-nums text-micro text-ink-2 uppercase tracking-caps-l">{tag}</Text>
          {pct ? (
            <Text testID="upload-progress-percent" className="font-mono text-micro text-ink-2 tabular-nums">
              {pct}
            </Text>
          ) : null}
        </View>
        {pct ? <Track pct={pct} color={tokens.textSecondary} /> : null}
        {kind === "uploading" ? <Helper testID="upload-keep-open">{keepOpenCopy(isBackgroundUploadSupported())}</Helper> : null}
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
      <View testID="upload-status-banner" className="w-full gap-1.5 rounded-xs bg-surface-3 border border-attention px-3 py-2">
        <View className="w-full flex-row items-center gap-2">
          <PauseCircle size={14} color={p.amber} />
          <Text className="flex-1 font-mono tabular-nums text-micro text-attention uppercase tracking-caps-l">{UPLOAD_TAG.paused}</Text>
          {pct ? (
            <Text testID="upload-progress-percent" className="font-mono text-micro text-ink-2 tabular-nums">
              {pct}
            </Text>
          ) : null}
        </View>
        {pct ? <Track pct={pct} color={p.amber} /> : null}
        <Helper testID="upload-status-message">
          {message}
          {truncation ? ` ${truncationCopy(truncation)}` : ""}
        </Helper>
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
        className="w-full flex-row items-center gap-2 rounded-xs bg-surface-3 border border-hairline-strong px-3 py-2"
      >
        <CheckCircle2 size={14} color={tokens.textPrimary} />
        <Text className="font-mono tabular-nums text-micro text-ink uppercase tracking-caps-l">
          Match video uploaded
        </Text>
      </View>
    );
  }

  // Failed. Red only when Try again can work (deck 0.6); otherwise grey.
  // The truncation is said here too (jits-5tj9.5): a short clip whose upload
  // then failed must not lose either fact.
  const act = uploadBannerTone(state) === "act";
  const isUpload = state.errorClass != null;
  return (
    <View
      testID="upload-status-banner"
      className={`w-full gap-1.5 rounded-xs bg-surface-3 border px-3 py-2 ${act ? "border-negative" : "border-hairline-strong"}`}
    >
      <View className="w-full flex-row items-center gap-2">
        {act ? <AlertTriangle size={14} color={tokens.stateNegative} /> : null}
        <Text
          className={`flex-1 font-mono tabular-nums text-micro uppercase tracking-caps-l ${act ? "text-negative" : "text-ink-3"}`}
          numberOfLines={2}
        >
          {isUpload ? UPLOAD_TAG.failed : message ?? "Recording unavailable"}
        </Text>
      </View>
      {isUpload || truncation ? (
        <Helper testID="upload-status-message">
          {isUpload ? message : ""}
          {truncation ? `${isUpload ? " " : ""}${truncationCopy(truncation)}` : ""}
        </Helper>
      ) : null}
      <Actions state={state} onRetry={onRetry} onDiscard={onDiscard} />
    </View>
  );
}
