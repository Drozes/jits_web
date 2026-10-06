import * as React from "react";
import { Text, View } from "react-native";
import { FilterChips } from "@/components/film-room/filter-chips";
import type { LibraryFilter, OutcomeFilter } from "@/lib/film-room/rows";
import { usePalette } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";

export interface MatchesListHeaderProps {
  /** `recordStrip(...)` output, e.g. `21 MATCHES · 14W 6L 1D · 1487`. */
  record: string;
  /**
   * The "Your highlights" reel carousel (spec 6.1 item 3), between the record
   * strip and the chips. Filters never apply to it. Null renders nothing (the
   * screen passes null when the lane has no tiles: clips off or a failed read).
   */
  carousel?: React.ReactNode;
  filter: LibraryFilter;
  opponentName: string | null;
  onOutcome: (outcome: OutcomeFilter) => void;
  onOpenOpponents: () => void;
  /** The cold-load placeholder, drawn under the chips (null once loaded). */
  skeleton?: React.ReactNode;
  /**
   * Zero matches (spec 10.2, board P-MT-10): no record strip and no chips
   * (nothing to count or filter); only the carousel slot stays.
   */
  zero?: boolean;
}

/**
 * Everything above the Matches feed, top to bottom (spec 6.1): the record
 * strip, the carousel slot, the result chips with the opponent picker
 * button, then the cold-load skeleton. The tab header itself (`TabHeader`)
 * sits outside the list so it never scrolls away.
 */
export function MatchesListHeader({ record, carousel = null, filter, opponentName, onOutcome, onOpenOpponents, skeleton = null, zero = false }: MatchesListHeaderProps) {
  const p = usePalette();
  return (
    <View testID="matches-list-header">
      {zero ? null : (
        <Text
          testID="matches-record"
          className="font-mono-medium"
          style={[typeStep("caption"), { marginBottom: 18, letterSpacing: TRACKING["caps-l"], color: p.text2 }, TABULAR]}
        >
          {record}
        </Text>
      )}
      {carousel ? (
        <View testID="matches-carousel-slot" style={{ marginBottom: 18 }}>
          {carousel}
        </View>
      ) : null}
      {zero ? null : <FilterChips filter={filter} opponentName={opponentName} onOutcome={onOutcome} onOpenOpponents={onOpenOpponents} />}
      {skeleton}
    </View>
  );
}
