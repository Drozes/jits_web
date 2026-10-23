import * as React from "react";
import { Text, View } from "react-native";
import type { TimekeeperWeightVerdict } from "@jits/shared/api/timekeeper";
import { SHIPPED_COPY, TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import type { TimekeeperAthleteRow } from "@/lib/match-flow/weight-check-view";
import { usePalette } from "@/lib/theme/palette";
import { TRACKING, typeStep } from "@/lib/typography";
import { FIGHT_RADIUS, TABULAR } from "../fight/fight-tokens";
import { FightButton, Mono } from "../fight/fight-ui";
import { weightText } from "./faceoff-top";

/** The row's weigh-in word: TK-K1 / TK-K2, or the timekeeper's own verdict (TK-K5, shipped `YOU FLAGGED`). */
function weighInLabel(row: TimekeeperAthleteRow): string {
  if (row.check === "confirmed") return TIMEKEEPER_COPY["TK-K5"];
  if (row.check === "flagged") return SHIPPED_COPY.youFlagged;
  return row.weightLbs != null ? TIMEKEEPER_COPY["TK-K2"] : TIMEKEEPER_COPY["TK-K1"];
}

/**
 * One athlete on the timekeeper's face-off (COPY-DECK B6, TK-K1 to TK-K5):
 * the name and ready state (TK-K3, TK-K4), the rated weight (PM26) and the
 * weigh-in state, and, when the match has the timekeeper weight check (A19,
 * `row.canJudge`), the verdicts: `Confirm` and `Doesn't look right`, or
 * `Withdraw flag` over the timekeeper's own open flag. No Signal Red here:
 * the screen's one primary is Start. Amber marks what is still owed.
 */
export function FaceoffAthleteRow({
  row,
  busy,
  onCheck,
}: {
  row: TimekeeperAthleteRow;
  /** A verdict on this athlete is in flight or not in the state yet. */
  busy: boolean;
  onCheck: (verdict: TimekeeperWeightVerdict) => void;
}) {
  const p = usePalette();
  const id = row.athleteId;
  // A verdict still owed, or the timekeeper's own flag holding the match.
  const owed = row.canJudge || row.canWithdraw;
  return (
    <View
      testID={`faceoff-athlete-row-${id}`}
      style={{ padding: 12, gap: 10, backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.plate }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text
          numberOfLines={1}
          className="font-heading uppercase"
          style={[typeStep("subhead"), { flex: 1, letterSpacing: TRACKING.loose, color: p.text }]}
        >
          {row.shortName}
        </Text>
        <Mono testID={`faceoff-athlete-ready-${id}`} bold color={row.ready ? p.text : p.amber}>
          {row.ready ? TIMEKEEPER_COPY["TK-K4"] : TIMEKEEPER_COPY["TK-K3"]}
        </Mono>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text testID={`faceoff-athlete-weight-${id}`} className="font-mono-bold" style={[typeStep("title"), { color: p.text }, TABULAR]}>
          {weightText(row.weightLbs)}
        </Text>
        <Mono testID={`faceoff-athlete-weigh-in-${id}`} bold color={owed ? p.amber : p.text2}>
          {weighInLabel(row)}
        </Mono>
      </View>
      {row.canJudge ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <FightButton
            testID={`faceoff-athlete-confirm-${id}`}
            label={SHIPPED_COPY.confirm}
            variant="secondary"
            height={44}
            busy={busy}
            onPress={() => onCheck("confirm")}
            style={{ flex: 1 }}
          />
          <FightButton
            testID={`faceoff-athlete-flag-${id}`}
            label={SHIPPED_COPY.flag}
            variant="ghost"
            height={44}
            disabled={busy}
            onPress={() => onCheck("flag")}
            style={{ flex: 1 }}
          />
        </View>
      ) : row.canWithdraw ? (
        <FightButton
          testID={`faceoff-athlete-withdraw-${id}`}
          label={SHIPPED_COPY.withdrawFlag}
          variant="secondary"
          height={44}
          busy={busy}
          onPress={() => onCheck("withdraw")}
        />
      ) : null}
    </View>
  );
}
