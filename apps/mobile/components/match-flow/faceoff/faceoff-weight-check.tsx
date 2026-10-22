import * as React from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { isValidReweigh } from "@/lib/match-flow/use-faceoff";
import { usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS } from "../fight/fight-tokens";
import { TABULAR, typeSize, typeStep } from "@/lib/typography";
import { FightButton, Mono, StatusPlate, shortName } from "../fight/fight-ui";
import { useFaceoffContext } from "./faceoff-context";

const lbs = (w: number | null) => (w != null ? `${Number(w.toFixed(1))} LBS` : "NO WEIGHT");

/**
 * "YOUR CHECK": my verdict on the opponent's weigh-in, next to my own
 * WEIGHED IN plate (board P-Faceoff-Weight). Amber while owed, green once
 * confirmed.
 */
export function WeightCheckPlate({ opponentName }: { opponentName: string }) {
  const { weightCheck: w } = useFaceoffContext();
  const status = w.mine?.status ?? "pending";
  const done = status === "confirmed";
  const label = status === "flagged" ? "YOU FLAGGED" : "YOUR CHECK";
  const spoken = done ? "confirmed" : status === "flagged" ? "flagged" : "pending";
  return (
    <StatusPlate
      testID="faceoff-weight-check-plate"
      label={label}
      done={done}
      align="right"
      accessibilityLabel={`${opponentName}'s weight, your check ${spoken}`}
    />
  );
}

/**
 * The weight-check actions for the state in hand (jr_be-ahn.4, the owner's
 * blocking decision): my verdict on the opponent's weight, my open flag
 * (Withdraw), or the opponent's flag on me (re-weigh). Renders nothing when
 * no action or notice is due.
 *
 * "Waiting for {opp} to check your new weight." sits BELOW the actions,
 * never above them (timekeeper mode PM31 (1)): it goes away when the
 * opponent re-checks, a change this athlete does not make, and above the
 * verdict its going moved `Confirm` and `Doesn't look right` up by its own
 * height, so a tap meant for `Confirm` could land on the flag. Under the
 * actions it also keeps its slot while they stay (`HeldNotice`, keyed to
 * them), because content that shrinks below them moves them too on Android.
 */
export function WeightCheckPanel({ opponentDisplayName }: { opponentDisplayName: string }) {
  const f = useFaceoffContext();
  const w = f.weightCheck;
  const p = usePalette();
  if (!w.active) return null;
  if (w.loading) {
    return (
      <View testID="weight-check-loading" style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}>
        <ActivityIndicator color={p.text2} />
        <Mono>CHECKING WEIGH-INS...</Mono>
      </View>
    );
  }
  const opp = shortName(opponentDisplayName);
  const OPP = opp.toUpperCase();
  const sections: React.ReactNode[] = [];

  if (w.mustReweigh) {
    sections.push(<ReweighPrompt key="reweigh" notice={`${opp} says your weight doesn't look right. Re-weigh to continue.`} />);
  }

  if (w.myFlagOpen) {
    sections.push(
      <View key="flag-open" testID="weight-flag-hold" style={{ gap: 12 }}>
        <Notice text={`You flagged ${opp}'s weight. Match is on hold.`} alert />
        <FightButton
          testID="weight-check-withdraw"
          label="Withdraw flag"
          variant="secondary"
          busy={w.busy}
          onPress={() => void w.check("withdraw")}
        />
      </View>,
    );
  } else if (w.needsMyVerdict) {
    const verb = w.opponentReweighed ? "RE-WEIGHED AT" : "WEIGHED IN AT";
    sections.push(
      <View
        key="verdict"
        testID="weight-check-prompt"
        accessibilityLabel={`Confirm ${opp}'s weight`}
        style={{ gap: 12 }}
      >
        {w.mine?.status === "flagged" ? <Notice text={`You flagged ${opp}'s weight. Match is on hold.`} alert /> : null}
        <View style={{ alignItems: "center" }}>
          <Mono testID="weight-check-line" size="caption" bold spacing="caps-l" color={p.text}>
            {f.opponentWeight != null ? `${OPP} ${verb} ${lbs(f.opponentWeight)}` : `${OPP} HAS NO WEIGH-IN ON RECORD`}
          </Mono>
        </View>
        <FightButton
          testID="weight-check-confirm"
          label="Confirm"
          height={64}
          disabled={w.busy}
          onPress={() => void w.check("confirm")}
        />
        <FightButton
          testID="weight-check-flag"
          label="Doesn't look right"
          variant="secondary"
          disabled={w.busy}
          onPress={() => void w.check("flag")}
        />
      </View>,
    );
  }

  // Under the actions, its slot kept while they stay, keyed to them so it goes with them (PM31 (1)).
  const actions = w.myFlagOpen ? "flag-open" : w.needsMyVerdict ? "verdict" : null;
  const recheck = !w.mustReweigh && w.awaitingTheirRecheck;
  if (actions || recheck) {
    sections.push(<HeldNotice key={`await-recheck-${actions}`} show={recheck} testID="weight-await-recheck" text={`Waiting for ${opp} to check your new weight.`} />);
  }

  if (sections.length === 0 && w.awaitingTheirCheck) {
    sections.push(<Notice key="await" testID="weight-await-check" text={`Waiting for ${opp} to check your weight.`} />);
  }
  if (sections.length === 0) return null;
  return <View style={{ gap: 16 }}>{sections}</View>;
}

/** An amber attention notice (also the timekeeper-mode merged ready's, `merged-ready.tsx`). */
export function Notice({ text, alert = false, testID }: { text: string; alert?: boolean; testID?: string }) {
  const p = usePalette();
  return (
    <View
      testID={testID}
      accessibilityRole={alert ? "alert" : undefined}
      style={{
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: p.amber,
        borderRadius: FIGHT_RADIUS.button,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.amber }} />
      <Text className="font-body" style={[typeStep("body"), { flex: 1, color: p.amber }]}>
        {text}
      </Text>
    </View>
  );
}

/**
 * A notice whose slot outlives it (timekeeper mode PM31 (1)): once it has
 * shown, it keeps its place when `show` turns false, the same notice at the
 * same height but invisible and hidden from screen readers, until this
 * element unmounts (its section goes, or its key changes). So once shown,
 * neither its going nor its coming back changes the content's height. A
 * notice under the face-off's actions needs this: when the scroll content
 * shrinks, Android's ScrollView clamps its offset (react-native 0.81
 * `ReactScrollView.onLayoutChange`), so for an athlete scrolled to the end
 * the actions above a notice that went away moved down by its height. Its
 * first showing only grows the content under them, which moves nothing.
 */
export function HeldNotice({ show, text, testID }: { show: boolean; text: string; testID: string }) {
  const [shown, setShown] = React.useState(show);
  if (show && !shown) setShown(true);
  if (show) return <Notice testID={testID} text={text} />;
  if (!shown) return null;
  return (
    <View
      testID={`${testID}-held`}
      style={{ opacity: 0 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Notice text={text} />
    </View>
  );
}

/**
 * The flagged athlete's re-weigh: a new rated weight for this match only.
 * `notice` says who flagged it (the opponent here; the timekeeper, TK-F7, in
 * the timekeeper-mode merged ready).
 */
export function ReweighPrompt({ notice }: { notice: string }) {
  const f = useFaceoffContext();
  const p = usePalette();
  const [text, setText] = React.useState(f.myWeight != null ? String(f.myWeight) : "");
  const value = Number(text);
  const valid = text.trim() !== "" && isValidReweigh(value);
  return (
    <View testID="weight-reweigh" style={{ gap: 12 }}>
      <Notice text={notice} alert />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TextInput
          testID="weight-reweigh-input"
          accessibilityLabel="Your new weight in pounds"
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          maxLength={6}
          className="font-mono-bold"
          style={{
            width: 96,
            height: 56,
            paddingHorizontal: 10,
            ...typeSize("title"),
            ...TABULAR,
            color: p.text,
            backgroundColor: p.plate,
            borderWidth: 1,
            borderColor: valid ? p.strong : p.loss,
            borderRadius: FIGHT_RADIUS.button,
          }}
        />
        <Mono>LBS</Mono>
        <FightButton
          testID="weight-reweigh-submit"
          label="Re-weigh"
          busy={f.weightCheck.busy}
          disabled={!valid}
          onPress={() => void f.weightCheck.reweigh(value)}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
