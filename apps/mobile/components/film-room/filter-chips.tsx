import * as React from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { usePalette } from "@/lib/theme/palette";
import type { LibraryFilter, OutcomeFilter } from "@/lib/film-room/rows";

const OUTCOMES: { id: OutcomeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "win", label: "Wins" },
  { id: "loss", label: "Losses" },
  { id: "draw", label: "Draws" },
];

function Chip({ label, on, onPress, testID, a11y, role = "tab" }: { label: string; on: boolean; onPress: () => void; testID: string; a11y?: string; role?: "tab" | "button" }) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      // 36 pt chip + 4 pt slop above and below = a 44 pt target.
      hitSlop={{ top: 4, bottom: 4 }}
      style={{
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 2,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: on ? p.text : p.strong,
        backgroundColor: on ? p.text : p.secondaryBg,
      }}
    >
      <Text className="font-mono-bold uppercase" style={{ fontSize: 11, letterSpacing: 1.68, color: on ? p.bg : p.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

interface FilterChipsProps {
  filter: LibraryFilter;
  /** Display name of the picked opponent, when one is picked. */
  opponentName: string | null;
  onOutcome: (outcome: OutcomeFilter) => void;
  onOpenOpponents: () => void;
}

/** All / Wins / Losses / Draws, then the opponent picker chip. */
export function FilterChips({ filter, opponentName, onOutcome, onOpenOpponents }: FilterChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel="Filter matches"
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      style={{ marginHorizontal: -16 }}
    >
      {OUTCOMES.map((o) => (
        <Chip key={o.id} testID={`film-filter-${o.id}`} label={o.label} on={filter.outcome === o.id} onPress={() => onOutcome(o.id)} />
      ))}
      <Chip
        testID="film-filter-opponent"
        label={opponentName ? `vs ${opponentName} ▾` : "Opponent ▾"}
        a11y={opponentName ? `Opponent filter, ${opponentName}` : "Filter by opponent"}
        on={!!filter.opponentId}
        // Opens a picker rather than selecting a tab.
        role="button"
        onPress={onOpenOpponents}
      />
    </ScrollView>
  );
}
