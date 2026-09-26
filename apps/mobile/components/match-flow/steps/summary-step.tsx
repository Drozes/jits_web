import { Pressable, Share, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Share2, Scale, PlayCircle } from "lucide-react-native";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAuth } from "@/lib/auth/hooks";
import { cn } from "@/lib/cn";
import { buildShareUrl, buildShareText } from "@jits/shared/utils";
import { EloTile, Plate } from "@/components/ui/elo-system";

interface SummaryStepProps {
  /** Where the primary exit cta returns to (the Arena, on mobile). */
  exitHref: string;
  /** Copy on the primary exit cta. */
  exitLabel: string;
  matchType: "ranked" | "casual";
  matchStatus: string;
  /** "win" | "loss" | "draw"; null when no result was recorded yet. */
  outcome: "win" | "loss" | "draw" | null;
  /** Own ELO delta (signed). null for casual matches. */
  eloDelta: number | null;
  /** Authoritative pre-match rating (ranked only; null for casual). */
  eloBefore?: number | null;
  /** Authoritative post-match rating; falls back to current_elo. */
  eloAfter?: number | null;
  /** BE-stamped IBJJF division gap. Shown (informational) when > 0. */
  weightDivisionGap?: number | null;
  /**
   * `match_videos.id` for the clip just recorded, once the upload has
   * landed. Null until then, and null forever if recording was never
   * started or the upload failed.
   */
  videoId?: string | null;
  /** True while the upload is still in flight, so it shows as pending
   * rather than as a missing affordance or a link that would 404
   * (jits-p75q). Derived from the match-keyed upload store, so it stays
   * right across a remount and across a late-finishing upload. */
  videoPending?: boolean;
}

/**
 * Step 8: terminal summary screen. Mirrors D9 / D10 wireframes (lines
 * 1275-1337). Hero EloTile with before -> after for the rating tick,
 * a delta plate (positive / negative / draw), and the caller-supplied
 * exit cta plus a Done cta back to Home.
 *
 * The animated tick (480ms) is handled by EloTile when both `before`
 * and `after` are supplied. ELO RATED brand rule: the rating tick is
 * the only auto-animated brand moment.
 */
export function SummaryStep(props: SummaryStepProps) {
  const tokens = useThemedTokens();
  const router = useRouter();
  const { athlete } = useAuth();
  const {
    exitHref,
    exitLabel,
    matchType,
    matchStatus,
    outcome,
    eloDelta,
    eloBefore,
    eloAfter,
    weightDivisionGap,
    videoId,
    videoPending = false,
  } = props;
  const disputed = matchStatus === "disputed";
  const gap = weightDivisionGap ?? 0;

  // Authoritative ratings from the BE; no arithmetic re-derivation.
  const before = eloBefore ?? null;
  const after = eloAfter ?? null;

  async function handleShareResult() {
    if (!outcome || !athlete) return;
    const url = buildShareUrl("athlete", athlete.id);
    const text = buildShareText({
      type: "match-result",
      data: { outcome, elo: after, eloDelta },
    });
    try {
      await Share.share({
        title: "ELO RATED Match Result",
        message: `${text}\n${url}`,
        url,
      });
    } catch {
      toast.error("Could not share result");
    }
  }

  const verdictText = disputed
    ? "DISPUTED"
    : outcome === "win"
      ? "YOU WON"
      : outcome === "loss"
        ? "YOU LOST"
        : outcome === "draw"
          ? "DRAW"
          : "MATCH RECORDED";

  const verdictColor = disputed
    ? "text-negative"
    : outcome === "win"
      ? "text-positive"
      : outcome === "loss"
        ? "text-negative"
        : "text-ink";

  const plateVariant = disputed
    ? "loss"
    : outcome === "win"
      ? "win"
      : outcome === "loss"
        ? "loss"
        : "default";

  return (
    <View className="gap-5 px-1 py-4">
      <Plate variant={plateVariant} className="items-center gap-3">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Match Summary
        </Text>
        <Text
          testID="summary-verdict"
          className={cn("font-display text-[40px] tracking-mark", verdictColor)}
        >
          {verdictText}
        </Text>
        {disputed ? (
          <Text
            testID="summary-disputed-note"
            className="text-center font-body text-[12px] text-ink-2"
          >
            This result was disputed. An admin will review it; any rating
            change stands until then.
          </Text>
        ) : null}
        {eloDelta != null && eloDelta !== 0 ? (
          <Text
            testID="summary-elo-delta"
            className={cn(
              "font-mono-bold text-[20px] tabular-nums",
              eloDelta > 0 ? "text-positive" : "text-negative",
            )}
          >
            {eloDelta > 0 ? "▲ +" : "▼ "}
            {Math.abs(eloDelta)}
          </Text>
        ) : null}
      </Plate>

      {matchType === "ranked" && before != null && after != null && eloDelta != null && eloDelta !== 0 ? (
        <View className="items-center">
          <EloTile
            label="ELO Rating"
            before={before}
            after={after}
            size="large"
            accent
          />
        </View>
      ) : after != null ? (
        <View className="items-center">
          <EloTile label="ELO Rating" value={after} size="large" />
        </View>
      ) : null}

      {matchType === "ranked" && gap > 0 ? (
        <View className="flex-row items-center gap-2 rounded-xs bg-surface-3 border border-hairline-strong px-3 py-2">
          <Scale size={14} color={tokens.textSecondary} />
          <Text className="flex-1 font-mono text-[10px] text-ink-2 uppercase tracking-caps-l">
            <Text className="tabular-nums">{gap}</Text> weight
            {gap > 1 ? " classes" : " class"} apart. Heavier athlete{"’"}s ELO
            was adjusted.
          </Text>
        </View>
      ) : null}

      <View className="gap-3 pt-2">
        {/* Playback is offered on outcome-independent grounds: a disputed
            match's video is exactly the one worth watching, and the profile
            list that was the only other entry point filters on
            status='completed' (jits-p75q). */}
        {videoId ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/(app)/video/${videoId}`)}
            className="flex-row items-center justify-center gap-2 border border-hairline-strong rounded-sm bg-surface-3 py-3 active:bg-surface-4"
          >
            <View pointerEvents="none">
              <PlayCircle size={14} color={tokens.textPrimary} />
            </View>
            <Text className="font-heading text-[13px] text-ink uppercase tracking-caps">
              Watch Match Video
            </Text>
          </Pressable>
        ) : videoPending ? (
          <View className="flex-row items-center justify-center gap-2 border border-hairline-strong rounded-sm py-3 opacity-60">
            <View pointerEvents="none">
              <PlayCircle size={14} color={tokens.textSecondary} />
            </View>
            <Text className="font-heading text-[13px] text-ink-2 uppercase tracking-caps">
              Video Uploading...
            </Text>
          </View>
        ) : null}
        {outcome && !disputed ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleShareResult}
            className="flex-row items-center justify-center gap-2 border border-hairline-strong rounded-sm bg-surface-3 py-3 active:bg-surface-4"
          >
            <View pointerEvents="none">
              <Share2 size={14} color={tokens.textPrimary} />
            </View>
            <Text className="font-heading text-[13px] text-ink uppercase tracking-caps">
              Share Result
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          testID="summary-exit"
          accessibilityRole="button"
          onPress={() => router.replace(exitHref)}
          className="bg-cta items-center justify-center py-3 rounded-sm active:bg-cta-hover"
        >
          <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
            {exitLabel}
          </Text>
        </Pressable>
        <Pressable
          testID="summary-done"
          accessibilityRole="button"
          onPress={() => router.replace("/")}
          className="items-center justify-center border border-hairline-strong rounded-sm py-3 active:bg-surface-4"
        >
          <Text className="font-heading text-[13px] text-ink uppercase tracking-caps">
            Done
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
