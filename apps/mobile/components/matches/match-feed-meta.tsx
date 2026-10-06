import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import { deltaLabel, outcomeLetter, outcomeWord, shortDate, titleDate } from "@/lib/film-room/format";
import { usePalette, type Palette } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { AthleteTile } from "@/components/film-room/athlete-tile";

/** C-M13 and C-M14. */
export const DISPUTED_TAG = "DISPUTED";
export const DELTA_PENDING = "Pending";

type Tone = "gain" | "loss" | "neutral";

/** Gain and loss inks; a draw and a zero delta stay neutral (`ink-2`), never amber in a list. */
function ink(p: Palette, tone: Tone): { fg: string; rule: string } {
  if (tone === "gain") return { fg: p.win, rule: p.winRule };
  if (tone === "loss") return { fg: p.loss, rule: p.loss };
  return { fg: p.text2, rule: p.strong };
}

function deltaWords(delta: number | null, disputed: boolean): string | null {
  if (delta == null) return disputed ? "Elo pending" : null;
  if (delta === 0) return "no change";
  return delta > 0 ? `plus ${delta}` : `minus ${Math.abs(delta)}`;
}

function Tag({ label, color, border }: { label: string; color: string; border: string }) {
  return (
    <View style={{ height: 18, paddingHorizontal: 5, borderRadius: 2, borderWidth: 1, borderColor: border, justifyContent: "center" }}>
      <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color }, TABULAR]}>
        {label}
      </Text>
    </View>
  );
}

interface MatchFeedMetaProps {
  item: MatchLibraryItem;
  /** Opponent short name (`shortName`). */
  opp: string;
  /** FIRST MATCH / FIRST WIN (only once the full history is loaded). */
  tags: readonly string[];
  /** The media's status badge (`feedBadgeLabel`), read after the opponent; null when none. */
  badge: string | null;
  onPress: () => void;
}

/**
 * The card's meta row (specs/matches-tab 6.2): opponent avatar, `vs {opp}`,
 * then outcome letter, the shipped `deltaLabel`, `shortDate`, tags and
 * DISPUTED. The whole row is one Pressable that opens match detail; the
 * trailing chevron is decoration inside it with no target of its own.
 * `film-card-<matchId>` is what the match-loop harness taps.
 */
export function MatchFeedMeta({ item, opp, tags, badge, onPress }: MatchFeedMetaProps) {
  const p = usePalette();
  const letter = outcomeLetter(item.outcome);
  const letterTone: Tone = letter === "W" ? "gain" : letter === "L" ? "loss" : "neutral";
  const delta = deltaLabel(item.elo_delta);
  const deltaTone: Tone = item.elo_delta == null || item.elo_delta === 0 ? "neutral" : item.elo_delta > 0 ? "gain" : "loss";
  const disputed = item.status === "disputed";
  const date = shortDate(item.completed_at);
  const label = [
    `Open match vs ${opp}${badge ? `, ${badge.toLowerCase()}` : ""}. ${outcomeWord(item.outcome)}`,
    deltaWords(item.elo_delta, disputed),
    titleDate(item.completed_at),
    ...tags.map((t) => t.toLowerCase()),
    disputed ? "disputed" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      testID={`film-card-${item.match_id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-row active:opacity-70"
      style={{ gap: 10, paddingTop: 12, paddingBottom: 4, minHeight: 56, alignItems: "flex-start" }}
    >
      <AthleteTile name={item.opponent?.display_name ?? "Opponent"} photoUrl={item.opponent?.profile_photo_url} size={24} />
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <Text numberOfLines={1} className="font-heading" style={[typeStep("subhead"), { color: p.text }]}>
          vs {opp}
        </Text>
        <View className="flex-row flex-wrap items-center" style={{ gap: 7 }}>
          {letter ? <Tag label={letter} color={ink(p, letterTone).fg} border={ink(p, letterTone).rule} /> : null}
          {delta ? (
            <Text testID="film-card-delta" className="font-mono-bold" style={[typeStep("small"), { letterSpacing: TRACKING.loose, color: ink(p, deltaTone).fg }, TABULAR]}>
              {delta}
            </Text>
          ) : disputed ? (
            // C-M14: the rating waits on the dispute.
            <Text testID="film-card-delta" className="font-mono-bold uppercase" style={[typeStep("caption"), { letterSpacing: TRACKING.caps, color: p.amber }, TABULAR]}>
              {DELTA_PENDING}
            </Text>
          ) : null}
          <Text className="font-mono-medium" style={[typeStep("caption"), { letterSpacing: TRACKING.caps, color: p.text3 }, TABULAR]}>
            · {date}
          </Text>
          {tags.map((t) => (
            <Tag key={t} label={t} color={p.text} border={p.strong} />
          ))}
          {disputed ? <Tag label={DISPUTED_TAG} color={p.amber} border={p.amberRule} /> : null}
        </View>
      </View>
      <View
        testID="film-card-chevron"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{ width: 24, height: 44, alignItems: "flex-end", justifyContent: "center" }}
      >
        <ChevronRight size={18} color={p.text3} />
      </View>
    </Pressable>
  );
}
