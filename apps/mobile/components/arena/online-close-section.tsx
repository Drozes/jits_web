/**
 * "Online & close · N" (jr_be 016 addendum, contract-arena-nearby 3; jr_be
 * spec 023): live athletes within the close radius who are not on the
 * viewer's mat. Collapsed by default (the header carries the count),
 * expanded state remembered for the app session only. Hidden by the screen
 * when N = 0.
 *
 * Rows reuse the On the mat row with its band. A row the server marks
 * `can_challenge` gets the normal action (ROLL, Sent, Pending, go live,
 * capped), because indoor GPS can put two athletes on one mat a long way
 * apart. Any other row keeps a neutral "Not on your mat" hint in place of
 * ROLL, as before spec 023. Secondary styling only: the red stays GO LIVE /
 * the Closest Match CTA.
 *
 * The header's radius comes from the server's `ranges` (`< 3 km`); a server
 * from before 023 sends none, so it reads that server's `< 2 km` (or a
 * larger row band, if one ever says more).
 */
import { Text, View } from "react-native";
import { StatePressable } from "@/components/ui/state-pressable";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { formatBandLabel, formatBandSpoken, type ArenaCloseRow, type ArenaRanges } from "@jits/shared/api/location";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useCloseSectionExpanded } from "@/lib/arena/use-arena-nearby";
import type { ArenaCompetitor } from "@/lib/arena/use-arena-roster";
import { MAX_SCALE } from "@/components/arena/strip-primitives";
import { MatRow, type MatRowAction } from "@/components/arena/mat-board";
import { TABULAR } from "@/lib/typography";

/** The radius of the server before spec 023, which sends no ranges. */
const LEGACY_CLOSE_RADIUS_M = 2000;

/**
 * The header's radius in meters: the server's `ranges`; without them (a
 * server before spec 023) that server's 2 km, or a larger row band if one
 * ever says more. Never below 2 km there, so an old server reads `< 2 km`
 * even when every close row is in its `< 500 m` band (C2).
 */
export function closeRadiusMeters(ranges: ArenaRanges | null, rows: readonly { near: ArenaCloseRow }[]): number {
  if (ranges) return ranges.closeRadiusM;
  let max = LEGACY_CLOSE_RADIUS_M;
  for (const r of rows) max = Math.max(max, r.near.bandMaxM);
  return max;
}

interface Props {
  rows: { row: ArenaCompetitor; near: ArenaCloseRow }[];
  /** The server's configured ranges (jr_be spec 023), null before 023. */
  ranges: ArenaRanges | null;
  friendIds: ReadonlySet<string>;
  /** The screen's action for a row (sent / pending stay; ROLL becomes the hint unless challengeable). */
  actionFor: (id: string) => MatRowAction;
  /** Whether a challengeable row's action is disabled right now (the screen's On the mat rule). */
  disabledFor: (action: MatRowAction) => boolean;
  /** ROLL on a challengeable close row: the row and its band. */
  onRoll: (row: ArenaCompetitor, near: ArenaCloseRow) => void;
  onGoLive: () => void;
  onOpenProfile: (id: string) => void;
}

export function OnlineCloseSection({
  rows,
  ranges,
  friendIds,
  actionFor,
  disabledFor,
  onRoll,
  onGoLive,
  onOpenProfile,
}: Props) {
  const tokens = useThemedTokens();
  const [expanded, toggle] = useCloseSectionExpanded();
  const n = rows.length;
  if (n === 0) return null;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const radiusM = closeRadiusMeters(ranges, rows);
  return (
    <View testID="arena-online-close">
      <StatePressable
        dim
        testID="arena-online-close-header"
        accessibilityRole="button"
        accessibilityLabel={`Online and close, ${n} ${n === 1 ? "athlete" : "athletes"}, ${formatBandSpoken(radiusM)}`}
        accessibilityState={{ expanded }}
        onPress={toggle}
        className="min-h-[44px] flex-row items-center justify-between border-b border-hairline"
      >
        <View className="flex-row items-center gap-1">
          <Chevron size={14} color={tokens.textTertiary} />
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-heading text-micro text-ink-3 uppercase tracking-caps-xl"
          >
            {`Online & close · ${n}`}
          </Text>
        </View>
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-mono-bold text-micro text-ink-2 uppercase tracking-caps-l"
          style={TABULAR}
        >
          {formatBandLabel(radiusM)}
        </Text>
      </StatePressable>
      {expanded
        ? rows.map(({ row, near }) => {
            const band = { label: formatBandLabel(near.bandMaxM), spoken: formatBandSpoken(near.bandMaxM) };
            const own = actionFor(row.id);
            if (near.canChallenge) {
              return (
                <MatRow
                  key={row.id}
                  competitor={row}
                  action={own}
                  disabled={disabledFor(own)}
                  onRoll={() => onRoll(row, near)}
                  onGoLive={onGoLive}
                  onOpenProfile={() => onOpenProfile(row.id)}
                  isFriend={friendIds.has(row.id)}
                  band={band}
                />
              );
            }
            const action: MatRowAction =
              own.kind === "sent" || own.kind === "pending" ? own : { kind: "not-on-mat" };
            return (
              <MatRow
                key={row.id}
                competitor={row}
                action={action}
                disabled
                onRoll={() => {}}
                onGoLive={() => {}}
                onOpenProfile={() => onOpenProfile(row.id)}
                isFriend={friendIds.has(row.id)}
                band={band}
              />
            );
          })
        : null}
    </View>
  );
}
