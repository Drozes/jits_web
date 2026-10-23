import * as React from "react";
import { ActivityIndicator, Linking, Text, View } from "react-native";
import { Lock } from "lucide-react-native";
import { useStepMatchSync } from "@/lib/match-flow/match-sync-context";
import { useMatchFlow } from "@/lib/match-flow/match-flow-context";
import type { RatedWeight } from "@/lib/match-flow/step-seams";
import { SHIPPED_COPY, TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import { deriveTimekeeperRows, timekeeperOwesVerdict } from "@/lib/match-flow/weight-check-view";
import { useTimekeeperChecks } from "@/lib/match-flow/use-timekeeper-checks";
import {
  cameraGateOf,
  deriveStartGate,
  useTimekeeperStart,
  type StartBlockedReason,
  type StartGate,
} from "@/lib/match-flow/use-timekeeper-start";
import { consentedIn, useAiConsent } from "@/lib/moderation/ai-consent";
import { usePalette } from "@/lib/theme/palette";
import { TRACKING, typeStep } from "@/lib/typography";
import { FIGHT_RADIUS } from "../fight/fight-tokens";
import { FightButton, Mono } from "../fight/fight-ui";
import { useMatchRecorder } from "../match-recorder-context";
import { FaceoffAthleteRow } from "./faceoff-athlete-row";
import { useFaceoffContext } from "./faceoff-context";
import { FaceoffTopBar, LeaveButton, useLeaveOnBack } from "./faceoff-top";
import { TimekeeperConsentGate } from "./timekeeper-consent-gate";
import { TimeoutChip } from "./timeout-chip";

export interface FaceoffTimekeeperProps {
  matchId: string;
  durationSeconds: number;
  /** Where the timekeeper's own exits go (their Leave is a drop-out back to the picker). */
  exitHref: string;
  /**
   * The athletes' rated weights, challenger first (`roles.athletes` order;
   * BE-G3, PM26, `seams.ratedWeights`): what each row shows and what a
   * verdict quotes as `weightSeen` (`checkAthleteWeightAsTimekeeper`). A null
   * weight (the state not read yet, or none on the challenge) offers no
   * verdict, since the server refuses one that does not quote the rated
   * weight. Never the profile weight.
   */
  ratedWeights: readonly RatedWeight[];
}

/**
 * The header of the timekeeper's face-off, above the camera (the wizard
 * places it where an athlete's `FaceoffTop` goes): the top bar with Leave,
 * TK-K0 `FACE-OFF · TIMEKEEPER`, and the face-off timeout TK-D9 from the seat
 * (A26). Leave is the face-off's (`useFaceoff`, whose provider the wizard
 * mounts for the timekeeper too, inactive): the seat's drop-out before the
 * start (A5, R21; `roles.caps.leave` "timekeeper_seat", alert TK-K14, slice
 * M4's `useFaceoffLeave`), also on Android back. It is gone while Start is in
 * flight and after it went through, where a Leave would be a no contest.
 * Screen readers call it by its word, `Leave`: unlike the athletes' Leave it
 * cancels nothing.
 */
export function FaceoffTimekeeperTop() {
  const { tkState } = useMatchFlow();
  const { canLeave, cancelling, leave } = useFaceoffContext();
  useLeaveOnBack(canLeave, leave);
  return (
    <View style={{ gap: 12 }}>
      <FaceoffTopBar
        label={TIMEKEEPER_COPY["TK-K0"]}
        leave={
          canLeave ? (
            <LeaveButton
              testID="faceoff-leave"
              accessibilityRole="button"
              accessibilityLabel={SHIPPED_COPY.leave.text}
              cancelling={cancelling}
              onPress={leave}
            />
          ) : null
        }
        labelTestID="faceoff-timekeeper-top-label"
      />
      <TimeoutChip timeoutAt={tkState?.timeoutAt ?? null} />
    </View>
  );
}

/**
 * The timekeeper's one combined face-off screen, below the camera (spec 4.2
 * Weigh-in, Ready and Start; COPY-DECK B6, TK-K1 to TK-K12): one row per
 * athlete (challenger first) with the weight verdicts when the match has the
 * timekeeper weight check (A19), the locked record row (TK-K9, D12), the
 * camera gate (TK-K10 to TK-K12) and Start with its reason, in the server's
 * blocker order (`deriveStartGate`). No auto-start: only this Start, never
 * retried by itself (A29), and never while the header's Leave is in flight
 * (the face-off's `timekeeperStart` claim). After a successful Start the
 * wizard's reconciler moves to `live`. The capture itself (portrait, the ultrawide lens, the
 * quality) is the wizard's camera (slice M9), not this screen's.
 *
 * It holds the timekeeper's one match channel on the face-off: an athlete's
 * Leave reaches this phone with their name (TK-E1, `useStepMatchSync`), and
 * Start's `timer_started` leaves through it.
 */
export function FaceoffTimekeeper({ matchId, ratedWeights }: FaceoffTimekeeperProps) {
  const { roles, tkState } = useMatchFlow();
  const { timekeeperStart } = useFaceoffContext();
  const sync = useStepMatchSync({ matchId });
  const weightVerdicts = roles.caps.weightVerdicts;
  const rows = deriveTimekeeperRows({ athletes: roles.athletes, ratedWeights, state: tkState, weightVerdicts });
  const checks = useTimekeeperChecks({ matchId, state: tkState });
  const camera = useCameraGate(roles.timekeeper?.id ?? null);
  const gate = deriveStartGate({
    blockers: tkState?.startBlockers ?? null,
    timekeeperOwesVerdict: timekeeperOwesVerdict(rows, weightVerdicts),
    camera,
  });
  const { starting, start } = useTimekeeperStart({
    matchId,
    timekeeperId: roles.timekeeper?.id ?? null,
    gate,
    claim: timekeeperStart,
    broadcastTimerStarted: sync.broadcastTimerStarted,
  });
  return (
    <View testID="faceoff-timekeeper" style={{ gap: 16 }}>
      {rows.map((row) => (
        <FaceoffAthleteRow
          key={row.athleteId}
          row={row}
          busy={checks.busy(row.athleteId)}
          onCheck={(verdict) => checks.check(row.athleteId, verdict, row.weightLbs)}
        />
      ))}
      <LockedRecordRow />
      <TimekeeperConsentGate timekeeperId={roles.timekeeper?.id ?? null} />
      {camera === "denied" ? <CameraDenied /> : null}
      <StartControl gate={gate} starting={starting} onStart={start} />
    </View>
  );
}

/**
 * The timekeeper's camera (D12): permission from the recorder, consent to
 * the timekeeper text from the cache (asked by `TimekeeperConsentGate`).
 */
function useCameraGate(timekeeperId: string | null) {
  const recorder = useMatchRecorder();
  const consent = useAiConsent();
  const consented = consentedIn(consent, timekeeperId, "timekeeper");
  return cameraGateOf(recorder.permission, consented);
}

/** "Record from my phone", locked on (TK-K9): the timekeeper always records. */
function LockedRecordRow() {
  const p = usePalette();
  return (
    <View
      testID="faceoff-record-locked"
      accessible
      accessibilityLabel={`${SHIPPED_COPY.recordFromMyPhone}. ${TIMEKEEPER_COPY["TK-K9"]}`}
      style={{ minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.button }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text className="font-heading uppercase" style={[typeStep("body"), { letterSpacing: TRACKING.caps, color: p.text }]}>
          {SHIPPED_COPY.recordFromMyPhone}
        </Text>
        <Text className="font-body" style={[typeStep("small"), { color: p.text2 }]}>
          {TIMEKEEPER_COPY["TK-K9"]}
        </Text>
      </View>
      <Lock size={18} color={p.text2} />
    </View>
  );
}

/** Camera permission denied for good (TK-K11, TK-K12): Start waits on Settings. */
function CameraDenied() {
  const p = usePalette();
  return (
    <View
      testID="faceoff-camera-denied"
      accessibilityRole="alert"
      style={{ padding: 12, gap: 12, borderWidth: 1, borderStyle: "dashed", borderColor: p.amber, borderRadius: FIGHT_RADIUS.button }}
    >
      <Text className="font-body" style={[typeStep("body"), { color: p.amber }]}>
        {TIMEKEEPER_COPY["TK-K11"]}
      </Text>
      <FightButton
        testID="faceoff-open-settings"
        label={TIMEKEEPER_COPY["TK-K12"]}
        variant="secondary"
        height={44}
        onPress={() => void Linking.openSettings()}
      />
    </View>
  );
}

function reasonText(reason: StartBlockedReason): string {
  return reason === "hold" ? SHIPPED_COPY.hold : TIMEKEEPER_COPY[reason];
}

/** Start (TK-K6), the screen's one primary, with the reason it is disabled. */
function StartControl({ gate, starting, onStart }: { gate: StartGate; starting: boolean; onStart: () => void }) {
  const p = usePalette();
  if (starting) {
    return (
      <View style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}>
        <ActivityIndicator color={p.text2} />
        <Mono>{SHIPPED_COPY.starting}</Mono>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {gate.reason ? (
        <View style={{ alignItems: "center" }}>
          <Mono testID="faceoff-start-reason" bold color={gate.reason === "hold" ? p.amber : p.text2}>
            {reasonText(gate.reason)}
          </Mono>
        </View>
      ) : null}
      <FightButton testID="faceoff-start" label={TIMEKEEPER_COPY["TK-K6"]} height={72} disabled={!gate.canStart} onPress={onStart} />
    </View>
  );
}
