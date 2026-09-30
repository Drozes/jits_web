import * as React from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import { CameraOff } from "lucide-react-native";
import { useViewerStakes } from "@/lib/match-flow/use-viewer-stakes";
import { setRecordingOptIn } from "@/lib/match-flow/recording-optin";
import { usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS } from "../fight/fight-tokens";
import { FightButton, Mono, StakesStrip, StatusPlate, shortName } from "../fight/fight-ui";
import { useFaceoffContext } from "./faceoff-context";
import { WeightCheckPanel, WeightCheckPlate } from "./faceoff-weight-check";
import type { FaceoffAthlete } from "./faceoff-top";

interface FaceoffBodyProps {
  phase: "weight" | "ready";
  me: FaceoffAthlete;
  opponent: FaceoffAthlete;
}

/**
 * The face-off below the header (and, on the ready phase, below the camera
 * the wizard renders between the two): stakes and weigh-in status, then the
 * recording opt-in and the ready handshake.
 */
export function FaceoffBody(props: FaceoffBodyProps) {
  return props.phase === "weight" ? <WeighIn {...props} /> : <ReadyCheck {...props} />;
}

function WeighIn({ me, opponent }: FaceoffBodyProps) {
  const f = useFaceoffContext();
  const p = usePalette();
  // Priced on the challenge's rated weights, exactly as record_match_result
  // will rate it (a missing one means no gap), and only once they are read.
  const stakes = useViewerStakes(f.weightsRated, me.current_elo, opponent.current_elo, f.myWeight, f.opponentWeight);
  const gap = stakes?.weight_division_gap ?? 0;
  const both = f.myWeight != null && f.opponentWeight != null;
  const diff = both ? Math.round(Math.abs(f.myWeight! - f.opponentWeight!) * 10) / 10 : null;
  const division = !stakes ? null : gap > 0 ? `${gap} ${gap > 1 ? "DIVISIONS" : "DIVISION"} APART` : "SAME DIVISION";
  const gapLine = [diff != null ? `${diff} LBS APART` : null, division].filter(Boolean).join(" · ");
  const oppName = shortName(opponent.display_name).toUpperCase();
  const cta = f.myWeight != null ? `Confirm ${Number(f.myWeight.toFixed(1))} lbs` : "Confirm weight";
  // Once my weight is in, the opponent's plate becomes my check of their
  // weigh-in (board P-Faceoff-Weight), when this match has checks.
  const checking = f.myWeighed && f.weightCheck.active;

  return (
    <View style={{ gap: 20 }}>
      {gapLine ? (
        <View
          style={{ height: 32, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.hairline }}
        >
          <Mono size={11}>{gapLine}</Mono>
        </View>
      ) : null}
      {stakes ? (
        <StakesStrip testID="weight-stakes" win={stakes.challenger_win} draw={stakes.challenger_draw} loss={stakes.challenger_loss} />
      ) : null}
      {gap > 0 ? (
        <Text testID="weight-gap-note" className="font-body" style={{ fontSize: 13, color: p.text2 }}>
          The heavier athlete{"’"}s rating is adjusted for the weight gap.
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <StatusPlate label={f.myWeighed ? "WEIGHED IN" : "CONFIRM WEIGHT"} done={f.myWeighed} accessibilityLabel={`You, ${f.myWeighed ? "weighed in" : "not weighed in"}`} />
        {checking ? (
          <WeightCheckPlate opponentName={oppName} />
        ) : (
          <StatusPlate
            testID="faceoff-opponent-weighed"
            label={f.opponentWeighed ? "WEIGHED IN" : `${oppName} WEIGHING IN`}
            done={f.opponentWeighed}
            align="right"
            accessibilityLabel={`${oppName}, ${f.opponentWeighed ? "weighed in" : "not weighed in yet"}`}
          />
        )}
      </View>
      {checking ? (
        <WeightCheckPanel opponentDisplayName={opponent.display_name} />
      ) : (
        <FightButton
          testID="weight-confirm"
          label={cta}
          height={64}
          onPress={() => void f.confirmWeight()}
          disabled={f.savingWeight || f.weightEditorOpen}
        />
      )}
    </View>
  );
}

function ReadyCheck({ opponent }: FaceoffBodyProps) {
  const f = useFaceoffContext();
  const p = usePalette();
  const oppName = shortName(opponent.display_name).toUpperCase();
  return (
    <View style={{ gap: 16 }}>
      {f.recording ? null : (
        <View
          testID="faceoff-camera-off"
          style={{ height: 120, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.button }}
        >
          <CameraOff size={22} color={p.text2} />
          <Mono>CAMERA OFF ON THIS PHONE</Mono>
        </View>
      )}
      <RecordingPanel oppName={oppName} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <StatusPlate label={f.myReady ? "YOU · READY" : "YOU · NOT READY"} done={f.myReady} accessibilityLabel={`You, ${f.myReady ? "ready" : "waiting"}`} />
        {/* The testID and the "Opponent, ready|waiting" label stay fixed: the
            match-loop harness reads both. */}
        <StatusPlate
          testID="ready-panel-opponent"
          label={`${oppName} · ${f.opponentReady ? "READY" : "NOT READY"}`}
          done={f.opponentReady}
          align="right"
          accessibilityLabel={`Opponent, ${f.opponentReady ? "ready" : "waiting"}`}
        />
      </View>
      {f.weightCheck.active && !f.weightCheck.canStart && !f.starting ? (
        // The weight gate (jr_be-ahn.4): a flag or a recheck holds the match,
        // and so does a check still owed while the rollout flag is on.
        <View testID="ready-weight-hold" style={{ gap: 12 }}>
          <WeightCheckPanel opponentDisplayName={opponent.display_name} />
          <FightButton testID="ready-button" label="I'm ready" height={72} onPress={f.tapReady} disabled />
          <View style={{ alignItems: "center" }}>
            <Mono>{f.weightCheck.blocked ? "MATCH ON HOLD · WEIGHT CHECK" : "WAITING FOR WEIGHT CHECKS"}</Mono>
          </View>
        </View>
      ) : f.starting ? (
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}>
          <ActivityIndicator color={p.text2} />
          <Mono>STARTING MATCH...</Mono>
        </View>
      ) : !f.myReady ? (
        <View style={{ gap: 10 }}>
          <Text className="font-body" style={{ alignSelf: "center", fontSize: 13, color: p.text2 }}>
            Match starts when you both tap ready
          </Text>
          <FightButton testID="ready-button" label="I'm ready" height={72} onPress={f.tapReady} />
        </View>
      ) : (
        <View style={{ alignItems: "center", paddingVertical: 16 }}>
          <Mono>{f.opponentReady ? "BOTH READY" : `WAITING FOR ${oppName}...`}</Mono>
        </View>
      )}
    </View>
  );
}

/** "Record from my phone" plus the opponent's choice (decision 5). */
function RecordingPanel({ oppName }: { oppName: string }) {
  const f = useFaceoffContext();
  const p = usePalette();
  const nobody = !f.recording && f.opponentRecording === false;
  const oppLabel =
    f.opponentRecording == null ? `${oppName} · CHOOSING` : f.opponentRecording ? `${oppName} RECORDING` : `${oppName} NOT RECORDING`;
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{ minHeight: 56, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.button }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text className="font-heading uppercase" style={{ fontSize: 13, letterSpacing: 0.8, color: p.text }}>
            Record from my phone
          </Text>
          <Mono testID="faceoff-opponent-recording" color={f.opponentRecording ? p.win : p.text3}>
            {oppLabel}
          </Mono>
        </View>
        <Switch
          testID="faceoff-record-toggle"
          accessibilityLabel="Record from my phone"
          value={f.recording}
          disabled={f.myReady}
          onValueChange={setRecordingOptIn}
          trackColor={{ false: p.panel, true: p.win }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={p.panel}
        />
      </View>
      {nobody ? (
        <View
          testID="faceoff-nobody-recording"
          accessibilityRole="alert"
          style={{ minHeight: 40, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderStyle: "dashed", borderColor: p.amber, borderRadius: FIGHT_RADIUS.button }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.amber }} />
          <Text className="font-body" style={{ flex: 1, fontSize: 13, color: p.amber }}>
            No one is recording this match
          </Text>
        </View>
      ) : null}
    </View>
  );
}
