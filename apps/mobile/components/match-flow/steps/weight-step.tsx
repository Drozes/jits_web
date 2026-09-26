import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Scale } from "lucide-react-native";
import { getEloStakes } from "@jits/shared/api/queries";
import type { EloStakes } from "@jits/shared/types/composites";
import { EloTile, Plate } from "@/components/ui/elo-system";
import { useAmber } from "@/components/match-detail/use-amber";
import { useResolvedColorScheme } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { useStepMatchSync } from "@/lib/match-flow/match-sync-context";
import { cn } from "@/lib/cn";

interface WeightStepProps {
  matchId: string;
  /** The opponent cancelled while this athlete was still on the scale. */
  onCancelledRemotely: (description?: string) => void;
  currentDisplayName: string;
  currentWeight: number | null;
  /** Viewer's rating, for the ranked "At stake" preview. */
  currentElo?: number | null;
  opponentDisplayName: string;
  opponentWeight: number | null;
  opponentElo?: number | null;
  matchType: "ranked" | "casual";
  onConfirm: () => void;
}

/** Signed whole-number delta: "+16", "-8". */
function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * The viewer's Win / Draw / Loss rating stakes for a ranked match, read once
 * from `calculate_elo_stakes` (jits-48a6). The viewer is passed as the
 * function's challenger: it is symmetric apart from the phantom weight
 * offset, which it applies from the weights themselves, so the challenger_*
 * fields are the viewer's stakes whichever side sent the challenge. Null
 * while loading, for casual, on missing ratings and on any failure: the row
 * is a nicety and never shows a spinner or an error.
 */
function useViewerStakes(
  enabled: boolean,
  myElo: number | null | undefined,
  oppElo: number | null | undefined,
  myWeight: number | null,
  oppWeight: number | null,
): EloStakes | null {
  const [stakes, setStakes] = React.useState<EloStakes | null>(null);
  React.useEffect(() => {
    // Inputs changed: never show stakes computed for the old ones.
    setStakes(null);
    if (!enabled || myElo == null || oppElo == null) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await getEloStakes(supabase, myElo, oppElo, myWeight, oppWeight);
        if (!cancelled) setStakes(s ?? null);
      } catch {
        if (!cancelled) setStakes(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, myElo, oppElo, myWeight, oppWeight]);
  return stakes;
}

/**
 * Step 2: both athletes confirm scale weights before the ready check.
 * Mirrors `apps/web/.../steps/weight-verify-step.tsx`, including the
 * weight-division-gap note for ranked matches.
 *
 * ELO design system: hero meta + h2-ish heading, two EloTile values for
 * each athlete's weight, the ranked "At stake" row, a hairline note when
 * divisions differ (amber: a gap is pressure, not a loss), and a Signal
 * Red confirm cta.
 */
export function WeightStep(props: WeightStepProps) {
  const {
    matchId,
    onCancelledRemotely,
    currentDisplayName,
    currentWeight,
    currentElo,
    opponentDisplayName,
    opponentWeight,
    opponentElo,
    matchType,
    onConfirm,
  } = props;
  // This step used to mount no channel at all, so a cancel sent while this
  // athlete was on the scale was lost and they sat on the ready check
  // forever (jits-bh2v). The reconciler also sees status=cancelled on the
  // next step mount, as the backstop.
  useStepMatchSync({
    matchId,
    onMatchCancelled: () => onCancelledRemotely("Your opponent cancelled the match."),
  });

  const ranked = matchType === "ranked";
  const stakes = useViewerStakes(ranked, currentElo, opponentElo, currentWeight, opponentWeight);

  const both = currentWeight != null && opponentWeight != null;
  const diff = both ? Math.abs(currentWeight! - opponentWeight!) : 0;
  // The gap note is ranked-only and comes solely from the RPC's IBJJF
  // division gap: it is what the result will actually use, and a local
  // estimate that the RPC then contradicted made the note flicker. No
  // stakes (loading or failed) means no note.
  const gap = stakes?.weight_division_gap ?? 0;

  return (
    <View className="gap-5 px-1 py-4">
      <View className="items-center gap-2">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Verify Weights
        </Text>
        <Text className="font-display text-[28px] text-ink text-center tracking-mark">
          ON THE SCALE
        </Text>
      </View>

      <View className="flex-row gap-3 justify-center">
        <WeightTile name={currentDisplayName} weight={currentWeight} />
        <WeightTile name={opponentDisplayName} weight={opponentWeight} />
      </View>

      {both && ranked && diff > 0 ? (
        <Text className="text-center font-mono text-[12px] text-ink-3 tracking-caps-l uppercase">
          Weight difference: {diff} lbs
        </Text>
      ) : null}

      {ranked && stakes ? <StakesRow stakes={stakes} /> : null}

      {ranked && gap > 0 ? <GapNote gap={gap} /> : null}

      <Pressable
        testID="weight-confirm"
        accessibilityRole="button"
        onPress={onConfirm}
        className="bg-cta items-center justify-center py-3 rounded-sm active:bg-cta-hover"
      >
        <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
          Confirm Weights
        </Text>
      </Pressable>
    </View>
  );
}

function StakesRow({ stakes }: { stakes: EloStakes }) {
  const amber = useAmber();
  const cells = [
    { key: "win", label: "Win", value: stakes.challenger_win, tone: "text-positive" },
    { key: "draw", label: "Draw", value: stakes.challenger_draw, tone: amber.text },
    { key: "loss", label: "Loss", value: stakes.challenger_loss, tone: "text-negative" },
  ];
  return (
    <View testID="weight-stakes" className="gap-2">
      <Text className="text-center font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        At stake
      </Text>
      <View className="flex-row gap-3">
        {cells.map((c) => (
          <View
            key={c.key}
            accessible
            accessibilityLabel={`${c.label} ${signed(c.value)}`}
            className="flex-1 items-center gap-1 rounded-sm bg-surface-3 border border-hairline py-2"
          >
            <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
              {c.label}
            </Text>
            <Text
              testID={`weight-stakes-${c.key}`}
              className={cn("font-mono-bold text-[18px] tabular-nums", c.tone)}
            >
              {signed(c.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Tailwind amber-500 / amber-600, matching useAmber's text classes; the
// icon takes a colour, not a class.
const AMBER_HEX = { dark: "#f59e0b", light: "#d97706" } as const;

function GapNote({ gap }: { gap: number }) {
  const scheme = useResolvedColorScheme();
  return (
    <Plate testID="weight-gap-note" className="flex-row items-center gap-2">
      <Scale size={16} color={AMBER_HEX[scheme]} />
      <Text className="flex-1 font-body text-[12px] text-ink-2">
        <Text className="font-mono tabular-nums">{gap}</Text> weight
        {gap > 1 ? " classes" : " class"} apart. The heavier athlete{"’"}s rating is adjusted.
      </Text>
    </Plate>
  );
}

function WeightTile({ name, weight }: { name: string; weight: number | null }) {
  return (
    <View className="flex-1 items-center gap-2">
      <Text
        className="font-heading text-[11px] text-ink-2 uppercase tracking-caps text-center"
        numberOfLines={1}
      >
        {name}
      </Text>
      <EloTile
        label="lbs"
        value={weight != null ? weight : "N/A"}
        size="medium"
      />
    </View>
  );
}
