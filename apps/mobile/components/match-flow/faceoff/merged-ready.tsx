import * as React from "react";
import { Text, View } from "react-native";
import { SHIPPED_COPY, TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import { clockRunnerName } from "@/lib/match-flow/clock-runner-name";
import type { FaceoffTimekeeperView } from "@/lib/match-flow/use-merged-ready";
import { usePalette } from "@/lib/theme/palette";
import { typeStep } from "@/lib/typography";
import { FightButton, Mono, shortName } from "../fight/fight-ui";
import { useFaceoffContext } from "./faceoff-context";
import { weightText } from "./faceoff-top";
import { Notice, ReweighPrompt } from "./faceoff-weight-check";

/**
 * A timekeeper-mode athlete's ready actions (spec 4.2 Ready and Start;
 * COPY-DECK B5): the merged ready replaces the shipped opponent check and
 * `I'm ready`, and nothing auto-starts (the timekeeper does). In order:
 *  - a flag on me (the opponent's, then the timekeeper's, TK-F7): re-weigh;
 *  - my own open flag on the opponent: on hold, Withdraw flag;
 *  - ready (the server's row): waiting for the opponent, then TK-F5;
 *  - else the opponent's weigh-in line, `Weight looks right, I'm ready`
 *    (TK-F4, `mark_match_ready`), `Doesn't look right` (the shipped flag),
 *    the shipped "Waiting for {opp} to check your new weight." after my
 *    re-weigh, and the helper TK-F6. That notice sits under the two buttons,
 *    never above them (PM31 (1)): it goes when the opponent's ready
 *    confirms my new weight, and above them its going moved TK-F4 up by its
 *    height, under a tap that then landed on `Doesn't look right` (Wave 3
 *    gate, T10).
 * The timekeeper is named through `clockRunnerName`: a read without their
 * name prints the role (TK-F1), never a blank (jits-o47s.27).
 */
export function MergedReady({ opponentDisplayName, timekeeper: tk }: { opponentDisplayName: string; timekeeper: FaceoffTimekeeperView }) {
  const f = useFaceoffContext();
  const w = f.weightCheck;
  const opp = shortName(opponentDisplayName);
  const OPP = opp.toUpperCase();
  if (w.mustReweigh) return <ReweighPrompt notice={SHIPPED_COPY.opponentFlaggedMe(opp)} />;
  if (tk.flaggedMe) return <ReweighPrompt notice={TIMEKEEPER_COPY["TK-F7"](clockRunnerName(tk.name))} />;
  if (w.myFlagOpen) {
    return (
      <View testID="weight-flag-hold" style={{ gap: 12 }}>
        <Notice text={SHIPPED_COPY.myFlagHold(opp)} alert />
        <FightButton
          testID="weight-check-withdraw"
          label={SHIPPED_COPY.withdrawFlag}
          variant="secondary"
          busy={w.busy}
          onPress={() => void w.check("withdraw")}
        />
      </View>
    );
  }
  if (f.myReady) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 16 }}>
        <Mono testID="merged-ready-waiting" bold>
          {f.opponentReady ? TIMEKEEPER_COPY["TK-F5"](clockRunnerName(tk.name)) : SHIPPED_COPY.waitingFor(OPP)}
        </Mono>
      </View>
    );
  }
  return <ReadyPrompt opp={opp} timekeeper={tk} />;
}

/** The opponent's weigh-in and the merged primary, before this athlete is ready. */
function ReadyPrompt({ opp, timekeeper: tk }: { opp: string; timekeeper: FaceoffTimekeeperView }) {
  const f = useFaceoffContext();
  const p = usePalette();
  const w = f.weightCheck;
  const OPP = opp.toUpperCase();
  const line =
    f.opponentWeight == null
      ? SHIPPED_COPY.noWeighIn(OPP)
      : w.opponentReweighed
        ? SHIPPED_COPY.reweighedAt(OPP, weightText(f.opponentWeight))
        : SHIPPED_COPY.weighedInAt(OPP, weightText(f.opponentWeight));
  return (
    <View testID="merged-ready" style={{ gap: 12 }}>
      <View style={{ alignItems: "center" }}>
        <Mono testID="weight-check-line" size="caption" bold spacing="caps-l" color={p.text}>
          {line}
        </Mono>
      </View>
      <FightButton
        testID="ready-button"
        label={TIMEKEEPER_COPY["TK-F4"]}
        height={72}
        busy={tk.readying}
        disabled={w.busy}
        onPress={f.tapReady}
      />
      {/* The flag needs the checks in hand (it quotes the weight on screen). */}
      {w.active && !w.loading ? (
        <FightButton
          testID="weight-check-flag"
          label={SHIPPED_COPY.flag}
          variant="secondary"
          disabled={w.busy || tk.readying}
          onPress={() => void w.check("flag")}
        />
      ) : null}
      {/* Under the buttons, so its going moves neither (PM31 (1)). */}
      {w.awaitingTheirRecheck ? <Notice testID="weight-await-recheck" text={SHIPPED_COPY.awaitRecheck(opp)} /> : null}
      <Text className="font-body" style={[typeStep("body"), { alignSelf: "center", textAlign: "center", color: p.text2 }]}>
        {TIMEKEEPER_COPY["TK-F6"](clockRunnerName(tk.name))}
      </Text>
    </View>
  );
}
