import * as React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import type { MatchExtras } from "@/lib/match-flow/match-extras";
import { useMatchFlow } from "@/lib/match-flow/match-flow-context";
import type { MatchAthleteView, MatchRoles } from "@/lib/match-flow/match-roles";
import { resultFromRoles } from "@/lib/match-flow/reconcile";
import { stepSeams } from "@/lib/match-flow/step-seams";
import { exitMatchTo } from "@/lib/match-flow/exit-to";
import { SHIPPED_COPY, TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import { useMatchUpload } from "@/lib/video/match-upload-store";
import { isBackgroundUploadSupported } from "@/lib/video/upload-capabilities";
import { keepOpenCopy } from "@/lib/video/upload-copy";
import { usePalette } from "@/lib/theme/palette";
import { TRACKING, typeStep } from "@/lib/typography";
import { FIGHT_RADIUS } from "../fight/fight-tokens";
import { FightButton, Mono } from "../fight/fight-ui";
import { MatchUploadLine } from "../match-upload-line";
import { RecordedResultPlate, StatusRow, type RecordedResultView } from "./confirm-step";
import { ResultEditEntry, ResultEditForm, recordedResultOf, useEditEntry } from "./result-edit-entry";

export interface TimekeeperDoneProps {
  matchId: string;
  /** Where `Done` (TK-R4, its label) exits to: Home (spec 4.2 Final), through `exitMatchTo`. */
  exitHref: string;
  durationSeconds: number;
  /** For the edit form (TK-ED2). */
  submissionTypes: SubmissionType[];
  /**
   * The athletes the DB has a positive confirmation for (the progress rows),
   * re-read on the done screen's 4 s poll until both are in (jits-o47s.44). They come from `get_match_details`
   * (the reconciler's `readSnapshot`): the `match_confirmations` RLS admits
   * participants only, and the timekeeper is never one.
   */
  confirmedAthleteIds: string[];
  /** The recorded result as this phone knows it. */
  resultData: BroadcastResult | null;
  /** The recorded result read from the match (winner, finish, lock time). */
  extras: MatchExtras;
}

/**
 * The timekeeper's done screen, its `summary` step (timekeeper mode spec 4.2
 * Confirm and Result edit; board B8 frame 3, B13): the matchup, `Result
 * recorded` (TK-R2, TK-R3), the result as recorded, each athlete's confirm
 * progress, `Edit result` while the 30-minute window is open (TK-ED1, or why
 * it closed: TK-ED5, TK-ED6, TK-ED8), the upload line (the timekeeper's film
 * is required, D12) and `Done` (TK-R4). A two-athlete match never renders it.
 *
 * The result shown is the match in hand's (the reconciler re-reads it on the
 * done screen's poll), so an edit shows the moment its read lands; this
 * phone's own copy only stands in before the first read of the result.
 * The wizard runs the summary step edge to edge, so the screen keeps its own
 * margins.
 *
 * A disputed match (an admin reviews it) and a voided one (a dispute
 * resolved as void; spec 6.2 keeps the timekeeper here) drop TK-R3 and the
 * confirm progress: nobody confirms next. The disputed one keeps the
 * shipped DISPUTED tag; the deck has no voided line or tag for this screen
 * yet, nor a line for a result an admin recorded (PM19), so it adds none
 * (PM copy request jits-o47s.32).
 */
export function TimekeeperDone({ matchId, exitHref, durationSeconds, submissionTypes, confirmedAthleteIds, resultData, extras }: TimekeeperDoneProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { match, roles, tkState } = useMatchFlow();
  const [editing, setEditing] = React.useState(false);
  // The count this phone's last saved edit made: until a read reaches it, the
  // match in hand (and so the plate and an edit's prefill) is the old result.
  const [savedCount, setSavedCount] = React.useState(0);
  const editCount = match.result_edit_count ?? 0;
  const awaitingRead = editCount < savedCount;
  const [a, b] = roles.athletes;
  const pair = { a: a.shortName, b: b.shortName };
  // The edit form's tiles on the rated weights (PM26), as the result form the
  // timekeeper recorded on: null until the state lands, never the profile weight.
  const ratedAthletes = React.useMemo(() => stepSeams(roles, tkState).pair, [roles, tkState]);
  const entry = useEditEntry({
    matchId,
    canEdit: roles.caps.canEditResult,
    status: match.status,
    recordedByAdmin: match.result_recorded_by_admin === true,
    tkState,
    athletes: roles.athletes,
    confirmedAthleteIds,
  });
  const finalElapsedS = match.final_elapsed_s ?? null;
  // Nobody confirms next: an admin reviews a disputed result, and a voided one is gone.
  const noConfirmNext = match.status === "disputed" || match.status === "voided";
  const frame = { paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 32 + insets.bottom, gap: 20 };

  // The form only while the window is open: it closes the moment the server would refuse.
  if (editing && entry.kind === "open") {
    return (
      <View testID="timekeeper-done-edit" style={frame}>
        <ResultEditForm
          matchId={matchId}
          athletes={ratedAthletes}
          clock={{ durationSeconds, finalElapsedS }}
          submissionTypes={submissionTypes}
          submissionLayout={roles.caps.submissionLayout}
          recorded={{ initial: recordedResultOf(match, roles.athletes), editCount }}
          onSaved={setSavedCount}
          onClose={() => setEditing(false)}
        />
      </View>
    );
  }

  return (
    <View testID="timekeeper-done" style={frame}>
      <View style={{ gap: 10 }}>
        <Mono>{TIMEKEEPER_COPY["TK-H2"](pair)}</Mono>
        <Text accessibilityRole="header" className="font-heading uppercase" style={[typeStep("headline-2xl"), { letterSpacing: TRACKING.loose, color: p.text }]}>
          {TIMEKEEPER_COPY["TK-R2"]}
        </Text>
        {noConfirmNext ? null : (
          <Text className="font-body" style={[typeStep("body"), { color: p.text2 }]}>
            {TIMEKEEPER_COPY["TK-R3"](pair)}
          </Text>
        )}
      </View>
      <RecordedResultPlate
        result={doneResultView(roles, resultData, extras, finalElapsedS, submissionTypes)}
        tag={match.status === "disputed" ? { text: SHIPPED_COPY.disputed, testID: "timekeeper-done-status", color: p.amber } : undefined}
      />
      {noConfirmNext ? null : <ConfirmProgress athletes={roles.athletes} confirmedAthleteIds={confirmedAthleteIds} />}
      <ResultEditEntry entry={entry} onEdit={() => setEditing(true)} waiting={awaitingRead} />
      <DoneUpload matchId={matchId} />
      <FightButton testID="timekeeper-done-exit" label={TIMEKEEPER_COPY["TK-R4"]} onPress={() => exitMatchTo(router, exitHref)} />
    </View>
  );
}

/**
 * The result as recorded: the match in hand's (fresh after an edit), else
 * this phone's copy before the first read of the result.
 */
export function doneResultView(
  roles: Pick<MatchRoles, "me" | "opponent" | "athletes">,
  resultData: BroadcastResult | null,
  extras: Pick<MatchExtras, "submissionName" | "finishTimeSeconds">,
  finalElapsedS: number | null,
  submissionTypes: SubmissionType[],
): RecordedResultView {
  const fromMatch = resultFromRoles(roles);
  const result = fromMatch ?? resultData;
  const isDraw = result?.result === "draw";
  const winner = roles.athletes.find((x) => x.athleteId === result?.winnerId) ?? null;
  // This phone's copy names the finish by its code; the match by name.
  const ownName = !fromMatch && resultData?.submissionCode
    ? (submissionTypes.find((t) => t.code === resultData.submissionCode)?.display_name ?? null)
    : null;
  const finish = extras.finishTimeSeconds ?? (fromMatch ? null : (resultData?.finishTimeSeconds ?? null));
  const submissionName = extras.submissionName ?? ownName;
  return {
    winnerName: isDraw ? null : (winner?.displayName ?? null),
    isDraw,
    submissionName,
    lengthSeconds: isDraw ? (finalElapsedS ?? finish) : (finish ?? finalElapsedS),
    tap: result?.result === "submission" && winner != null && submissionName != null,
  };
}

/** Each athlete's confirmation (the shipped confirm rows): {NAME} CONFIRMED ✓ or WAITING. */
function ConfirmProgress({
  athletes,
  confirmedAthleteIds,
}: {
  athletes: readonly [MatchAthleteView, MatchAthleteView];
  confirmedAthleteIds: string[];
}) {
  const p = usePalette();
  return (
    <View style={{ backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.plate }}>
      {athletes.map((athlete, i) => {
        const done = confirmedAthleteIds.includes(athlete.athleteId);
        return (
          <StatusRow
            key={athlete.athleteId}
            testID={`timekeeper-done-athlete-${athlete.athleteId}-${done ? "confirmed" : "waiting"}`}
            name={athlete.shortName}
            status={done ? SHIPPED_COPY.athleteConfirmed(athlete.shortName.toUpperCase()) : SHIPPED_COPY.waiting}
            done={done}
            divider={i === 0}
          />
        );
      })}
    </View>
  );
}

/** The timekeeper's film for the match (required, D12): the shipped upload line, and keep the app open while it goes. */
function DoneUpload({ matchId }: { matchId: string }) {
  const p = usePalette();
  const upload = useMatchUpload(matchId);
  const uploading = upload?.status === "pending" || upload?.status === "uploading";
  return (
    <View style={{ gap: 4 }}>
      <MatchUploadLine matchId={matchId} />
      {uploading ? (
        <Text testID="timekeeper-done-keep-open" className="font-body" style={[typeStep("small"), { color: p.text2 }]}>
          {keepOpenCopy(isBackgroundUploadSupported())}
        </Text>
      ) : null}
    </View>
  );
}
