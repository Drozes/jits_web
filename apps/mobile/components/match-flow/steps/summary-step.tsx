import { Pressable, Share, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Share2 } from "lucide-react-native";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAuth } from "@/lib/auth/hooks";
import { cn } from "@/lib/cn";
import { buildShareUrl, buildShareText } from "@jits/shared/utils";
import { EloTile, Plate } from "@/components/ui/elo-system";

interface SummaryStepProps {
  sessionId: string;
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
}

/**
 * Step 8: terminal summary screen. Mirrors D9 / D10 wireframes (lines
 * 1275-1337). Hero EloTile with before -> after for the rating tick,
 * a delta plate (positive / negative / draw), and back-to-lobby /
 * done ctas.
 *
 * The animated tick (480ms) is handled by EloTile when both `before`
 * and `after` are supplied. ELO RATED brand rule: the rating tick is
 * the only auto-animated brand moment.
 */
export function SummaryStep(props: SummaryStepProps) {
  const tokens = useThemedTokens();
  const router = useRouter();
  const { athlete } = useAuth();
  const { sessionId, matchType, matchStatus, outcome, eloDelta, eloBefore, eloAfter } =
    props;
  const disputed = matchStatus === "disputed";

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
        <Text className={cn("font-display text-[40px] tracking-mark", verdictColor)}>
          {verdictText}
        </Text>
        {eloDelta != null && eloDelta !== 0 ? (
          <Text
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

      <View className="gap-3 pt-2">
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
          accessibilityRole="button"
          onPress={() => router.replace(`/(app)/session/${sessionId}/lobby`)}
          className="bg-cta items-center justify-center py-3 rounded-sm active:bg-cta-hover"
        >
          <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
            Back to Lobby
          </Text>
        </Pressable>
        <Pressable
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
