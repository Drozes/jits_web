import * as React from "react";
import { Text, View } from "react-native";
import type { TimekeeperCandidate } from "@jits/shared/api/timekeeper";
import { usePalette } from "@/lib/theme/palette";
import { TRACKING, typeStep } from "@/lib/typography";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { TABULAR } from "../fight/fight-tokens";
import { CandidateRow } from "./candidate-row";
import { showsFriendCaption } from "./crew-view";

export interface CandidateRowsState {
  viewerIsChallenger: boolean;
  /** The other athlete's short name, for TK-P5b. */
  otherShort: string;
  busy: Readonly<Record<string, "timekeeper" | "competitor">>;
  /** The athlete whose Ask is in flight. */
  asking: string | null;
  /** False while a request is open (one per match) or an Ask is in flight. */
  canAsk: boolean;
  onAsk: (candidate: TimekeeperCandidate) => void;
}

export interface CandidateSectionProps extends CandidateRowsState {
  kind: "friends" | "nearby";
  rows: TimekeeperCandidate[];
  /** Search text is typed: an empty section hides, header and all (board P-TK-B2 frame 2). */
  searching: boolean;
}

/**
 * One section of the picker: `Friends` (TK-P5) or `Nearby` (TK-P6), its rows,
 * or, with nothing typed, its empty line (TK-P12, TK-P13).
 */
export function CandidateSection({ kind, rows, searching, ...state }: CandidateSectionProps) {
  const p = usePalette();
  if (rows.length === 0 && searching) return null;
  return (
    <View testID={`crew-section-${kind}`} style={{ gap: 8 }}>
      {/* 11px mono caps (boards P-TK-B2, P-TK-B3): the deck's strings are sentence case, the caps come from the style. */}
      <Text
        testID={`crew-section-${kind}-header`}
        className="font-mono-medium"
        style={[typeStep("caption"), { letterSpacing: TRACKING["caps-l"], color: p.text3, textTransform: "uppercase" }, TABULAR]}
      >
        {kind === "friends" ? C["TK-P5"] : C["TK-P6"]}
      </Text>
      {rows.length === 0 ? (
        <Text
          testID={`crew-section-${kind}-empty`}
          className="font-body"
          style={[typeStep("body"), { color: p.text2, paddingVertical: 10 }]}
        >
          {kind === "friends" ? C["TK-P12"] : C["TK-P13"]}
        </Text>
      ) : (
        rows.map((c) => (
          <CandidateRow
            key={c.athleteId}
            candidate={c}
            caption={showsFriendCaption(c.friendOf, state.viewerIsChallenger) ? C["TK-P5b"](state.otherShort) : null}
            busyAs={state.busy[c.athleteId] ?? null}
            asking={state.asking === c.athleteId}
            disabled={!state.canAsk}
            onAsk={state.onAsk}
          />
        ))
      )}
    </View>
  );
}
