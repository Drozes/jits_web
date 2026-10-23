import * as React from "react";
import { Text, View } from "react-native";
import { TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import type { FaceoffTimekeeperView } from "@/lib/match-flow/use-merged-ready";
import { usePalette } from "@/lib/theme/palette";
import { TRACKING, typeStep } from "@/lib/typography";
import { FIGHT_RADIUS } from "../fight/fight-tokens";
import { Mono } from "../fight/fight-ui";

/**
 * The timekeeper on a timekeeper-mode athlete's face-off (COPY-DECK B5,
 * TK-F1 to TK-F3): `TIMEKEEPER`, their name and, when the match has the
 * timekeeper weight check (the sub-flag snapshot, A19), whether they have
 * confirmed both weights. On the weigh-in and the ready check alike. Amber
 * while the check is owed, ink once done (done is never Gain Green).
 */
export function TimekeeperRow({ timekeeper: tk }: { timekeeper: FaceoffTimekeeperView }) {
  const p = usePalette();
  const C = TIMEKEEPER_COPY;
  const state = tk.checksWeights ? (tk.weightsConfirmed ? C["TK-F3"] : C["TK-F2"]) : null;
  // A read without the timekeeper's name: the TK-F1 label alone, never a blank in the spoken label.
  const name = tk.name.trim();
  return (
    <View
      testID="faceoff-timekeeper-row"
      accessible
      accessibilityLabel={[C["TK-F1"], name, state].filter(Boolean).join(", ")}
      style={{
        minHeight: 44,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderColor: p.hairline,
        borderRadius: FIGHT_RADIUS.button,
      }}
    >
      <Mono bold color={p.text3}>
        {C["TK-F1"]}
      </Mono>
      <Text
        numberOfLines={1}
        className="font-heading uppercase"
        style={[typeStep("callout"), { flex: 1, letterSpacing: TRACKING.caps, color: p.text }]}
      >
        {name}
      </Text>
      {state ? (
        <Mono testID="faceoff-timekeeper-state" bold color={tk.weightsConfirmed ? p.text : p.amber}>
          {state}
        </Mono>
      ) : null}
    </View>
  );
}
