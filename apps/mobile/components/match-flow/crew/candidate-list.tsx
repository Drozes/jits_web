import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { TimekeeperCandidates } from "@jits/shared/api/timekeeper";
import { Button } from "@/components/ui/elo-system/button";
import { usePalette } from "@/lib/theme/palette";
import { typeStep } from "@/lib/typography";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { CandidateSection, type CandidateRowsState } from "./candidate-section";
import { CrewSearch } from "./crew-search";
import { pickerSections } from "./crew-view";

export interface CandidateListProps extends CandidateRowsState {
  /** Null until the first read lands. */
  candidates: TimekeeperCandidates | null;
  loadError: boolean;
  onRetry: () => void;
  query: string;
  onQuery: (text: string) => void;
}

/**
 * Who the athletes can ask (spec 4.2 Pick, boards P-TK-B2 and P-TK-B3): the
 * search, then Friends and Nearby, with every empty and error state. Nobody
 * to ask at all (TK-P14) and a failed read (TK-P16) replace both sections
 * above the search; a search that finds nobody says so below it (TK-P15).
 */
export function CandidateList({ candidates, loadError, onRetry, query, onQuery, ...rows }: CandidateListProps) {
  const p = usePalette();
  const search = <CrewSearch value={query} onChange={onQuery} />;
  if (loadError) {
    return (
      <View style={{ gap: 16 }}>
        <View testID="crew-load-error" style={{ alignItems: "center", gap: 10, paddingVertical: 20 }}>
          <Text accessibilityRole="alert" className="font-body" style={[typeStep("body"), { color: p.text2, textAlign: "center" }]}>
            {C["TK-P16"].text}
          </Text>
          <Button testID="crew-load-retry" variant="secondary" height={44} label={C["TK-P16"].action} onPress={onRetry} />
        </View>
        {search}
      </View>
    );
  }
  if (!candidates) {
    return (
      <View style={{ gap: 16 }}>
        {search}
        <ActivityIndicator testID="crew-loading" color={p.text3} style={{ paddingVertical: 20 }} />
      </View>
    );
  }
  const s = pickerSections(candidates, query);
  if (s.empty === "none") {
    return (
      <View style={{ gap: 16 }}>
        <Text testID="crew-nobody" className="font-body" style={[typeStep("body"), { color: p.text2, textAlign: "center", paddingVertical: 20 }]}>
          {C["TK-P14"]}
        </Text>
        {search}
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      {search}
      {s.empty === "search" ? (
        <Text testID="crew-search-empty" className="font-body" style={[typeStep("body"), { color: p.text2 }]}>
          {C["TK-P15"]}
        </Text>
      ) : (
        <>
          <CandidateSection kind="friends" rows={s.friends} searching={s.searching} {...rows} />
          <CandidateSection kind="nearby" rows={s.nearby} searching={s.searching} {...rows} />
        </>
      )}
    </View>
  );
}
