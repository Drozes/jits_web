/**
 * "Online & close · N" (jr_be 016 addendum, contract-arena-nearby 3): live
 * athletes within 2 km who are not on the viewer's mat. Collapsed by default
 * (the header carries the count), expanded state remembered for the app
 * session only. Hidden by the screen when N = 0.
 *
 * Rows reuse the On the mat row with its band and a neutral "Not on your
 * mat" hint in place of ROLL (a challenge would fail the proximity gate).
 * Secondary styling only: the red stays GO LIVE / the Closest Match CTA.
 */
import { Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { ARENA_BAND_LABEL, ARENA_BAND_SPOKEN, type ArenaCloseBand } from "@jits/shared/api/location";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useCloseSectionExpanded } from "@/lib/arena/use-arena-nearby";
import type { ArenaCompetitor } from "@/lib/arena/use-arena-roster";
import { MAX_SCALE } from "@/components/arena/strip-primitives";
import { MatRow, type MatRowAction } from "@/components/arena/mat-board";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

interface Props {
  rows: { row: ArenaCompetitor; band: ArenaCloseBand }[];
  friendIds: ReadonlySet<string>;
  /** The screen's action for a row (sent / pending stay; ROLL becomes the hint). */
  actionFor: (id: string) => MatRowAction;
  onOpenProfile: (id: string) => void;
}

export function OnlineCloseSection({ rows, friendIds, actionFor, onOpenProfile }: Props) {
  const tokens = useThemedTokens();
  const [expanded, toggle] = useCloseSectionExpanded();
  const n = rows.length;
  if (n === 0) return null;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <View testID="arena-online-close">
      <Pressable
        testID="arena-online-close-header"
        accessibilityRole="button"
        accessibilityLabel={`Online and close, ${n} ${n === 1 ? "athlete" : "athletes"}`}
        accessibilityState={{ expanded }}
        onPress={toggle}
        className="min-h-[44px] flex-row items-center justify-between border-b border-hairline"
      >
        <View className="flex-row items-center gap-1">
          <Chevron size={14} color={tokens.textTertiary} />
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="font-heading text-[10px] text-ink-3 uppercase tracking-caps-xl"
          >
            {`Online & close · ${n}`}
          </Text>
        </View>
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-mono-bold text-[10px] text-ink-2 uppercase"
          style={TABULAR}
        >
          {"< 2 km"}
        </Text>
      </Pressable>
      {expanded
        ? rows.map(({ row, band }) => {
            const own = actionFor(row.id);
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
                band={{ label: ARENA_BAND_LABEL[band], spoken: ARENA_BAND_SPOKEN[band] }}
              />
            );
          })
        : null}
    </View>
  );
}
