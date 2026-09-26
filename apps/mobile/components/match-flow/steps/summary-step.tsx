import type * as React from "react";
import { Pressable, Share, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Share2, Scale, PlayCircle } from "lucide-react-native";
import { toast } from "@/components/ui/toast";
import { exitMatchTo } from "@/lib/match-flow/exit-to";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAuth } from "@/lib/auth/hooks";
import { cn } from "@/lib/cn";
import { buildShareUrl, buildShareText } from "@jits/shared/utils";
import { matchDetailHref } from "@/lib/match-detail/href";
import { EloTile, Plate } from "@/components/ui/elo-system";
import type { EloTileTone } from "@/components/ui/elo-system/elo-tile";
import { useAmber } from "@/components/match-detail/use-amber";
import { ARENA_HREF } from "@/lib/arena/constants";

interface SummaryStepProps {
  /** Match id, for the "View match details" fallback link. */
  matchId: string;
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
  /** Opponent's athlete id, for the Rematch shortcut (jits-00fr). */
  opponentId?: string | null;
  /** Opponent's display name, for the Rematch shortcut copy. */
  opponentName?: string | null;
}

/**
 * The Arena with the opponent to run it back against. The Arena reads
 * `rematch`; an Arena that ignores it is just the Arena. Navigated with
 * exitMatchTo, never a push: the match screen must unmount, because while it
 * is mounted the athlete stays offline and challenge prompts are suppressed
 * (useArenaMatchScreen).
 */
export function rematchHref(opponentId: string): string {
  return `${ARENA_HREF}?rematch=${encodeURIComponent(opponentId)}`;
}

/** Draw copy in amber; the hook is only mounted when a draw renders. */
function AmberText(props: React.ComponentProps<typeof Text>) {
  const amber = useAmber();
  return <Text {...props} className={cn(props.className, amber.text)} />;
}

/**
 * Step 8: terminal summary screen. Mirrors D9 / D10 wireframes (lines
 * 1275-1337). Hero EloTile with before -> after for the rating tick,
 * a delta plate (positive / negative / draw), a Rematch shortcut, and the
 * caller-supplied exit cta plus a Done cta back to Home.
 *
 * The animated tick (480ms) is handled by EloTile when both `before`
 * and `after` are supplied. ELO RATED brand rule: the rating tick is
 * the only auto-animated brand moment. Draws are amber, never red: both
 * athletes lose rating on a draw, but it is pressure, not a loss.
 */
export function SummaryStep(props: SummaryStepProps) {
  const tokens = useThemedTokens();
  const router = useRouter();
  const { athlete } = useAuth();
  const {
    matchId,
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
    opponentId,
    opponentName,
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
  const isDraw = !disputed && outcome === "draw";
  const VerdictText = isDraw ? AmberText : Text;
  // The delta follows the outcome, not the sign: a draw's loss is amber.
  const DeltaText = isDraw ? AmberText : Text;
  const deltaColor = isDraw ? undefined : (eloDelta ?? 0) > 0 ? "text-positive" : "text-negative";
  const tileTone: EloTileTone | undefined = isDraw
    ? "amber"
    : eloDelta == null || eloDelta === 0
      ? undefined
      : eloDelta > 0
        ? "positive"
        : "negative";
  const rematchName = opponentName?.trim() || null;
  const rematchFirst = rematchName?.split(/\s+/)[0] ?? null;

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
        <VerdictText
          testID="summary-verdict"
          className={cn("font-display text-[40px] tracking-mark", !isDraw && verdictColor)}
        >
          {verdictText}
        </VerdictText>
        {disputed ? (
          <Text
            testID="summary-disputed-note"
            className="text-center font-body text-[12px] text-ink-2"
          >
            An admin will review it. Your rating change stands until they do.
          </Text>
        ) : null}
        {eloDelta != null && eloDelta !== 0 ? (
          <DeltaText
            testID="summary-elo-delta"
            className={cn("font-mono-bold text-[20px] tabular-nums", deltaColor)}
          >
            {eloDelta > 0 ? "▲ +" : "▼ "}
            {Math.abs(eloDelta)}
          </DeltaText>
        ) : null}
      </Plate>

      {matchType === "ranked" && before != null && after != null && eloDelta != null && eloDelta !== 0 ? (
        <View className="items-center">
          <EloTile
            label="ELO Rating"
            before={before}
            after={after}
            size="large"
            tone={tileTone}
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
        {/* Always offered, not only as the no-video fallback: the Watch
            button plays only THIS device's clip, and the detail screen lists
            every video on the match from the server (both athletes'
            recordings, and a reopened match whose in-memory upload store is
            empty, jits-p75q). A text link, never a second red CTA. */}
        <Pressable
          testID="summary-view-match-details"
          accessibilityRole="button"
          onPress={() => router.push(matchDetailHref(matchId))}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="items-center py-2 active:opacity-70"
        >
          <Text className="font-heading text-[12px] text-ink-2 uppercase tracking-caps">
            View match details
          </Text>
        </Pressable>
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
        {opponentId && rematchName && !disputed ? (
          // Secondary outline: Back to Arena stays the one Signal Red cta.
          <Pressable
            testID="summary-rematch"
            accessibilityRole="button"
            accessibilityLabel={`Rematch ${rematchName}`}
            onPress={() => exitMatchTo(router, rematchHref(opponentId))}
            className="items-center justify-center border border-hairline-strong rounded-sm bg-surface-3 py-3 active:bg-surface-4"
          >
            <Text
              className="font-heading text-[13px] text-ink uppercase tracking-caps"
              numberOfLines={1}
            >
              Rematch {rematchFirst}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          testID="summary-exit"
          accessibilityRole="button"
          onPress={() => exitMatchTo(router, exitHref)}
          className="bg-cta items-center justify-center py-3 rounded-sm active:bg-cta-hover"
        >
          <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
            {exitLabel}
          </Text>
        </Pressable>
        {/* A text link, like View match details: below the outline buttons
            and the one red cta, it is the quiet way out. */}
        <Pressable
          testID="summary-done"
          accessibilityRole="button"
          onPress={() => exitMatchTo(router, "/")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="items-center py-2 active:opacity-70"
        >
          <Text className="font-heading text-[12px] text-ink-2 uppercase tracking-caps">
            Done
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
