import * as React from "react";
import { View } from "react-native";
import { ratedWeightOf } from "@jits/shared/api/timekeeper";
import { useMatchFlow } from "@/lib/match-flow/match-flow-context";
import { useMatchSyncContext } from "@/lib/match-flow/match-sync-context";
import { SHIPPED_COPY } from "@/lib/match-flow/timekeeper-copy";
import { FaceoffChip } from "../faceoff/faceoff-top";
import { AttentionLine } from "./attention-line";
import { CandidateList } from "./candidate-list";
import { CrewHeading } from "./crew-heading";
import { CrewTopBar } from "./crew-top-bar";
import { RequestCard } from "./request-card";
import { useCrewCandidates } from "./use-crew-candidates";
import { useCrewRequest } from "./use-crew-request";

export interface CrewStepProps {
  matchId: string;
  /** Where the athlete's Leave (cancel for all, before anyone is seated) exits to. */
  exitHref: string;
}

/**
 * The `crew` step (timekeeper mode, athletes only): pick a timekeeper before
 * the face-off (spec 4.2 Pick, boards P-TK-B2 and P-TK-B3, TK-P1 to TK-P23,
 * TK-W1, TK-D1). Leave, the fight chip (rated weights, PM26), the title with
 * the pick deadline, then the open request's card or the line asking for
 * another pick, and the people to ask. The match, the viewer's roles and the
 * timekeeper-mode state (open request, last outcome) come from
 * `useMatchFlow()`; the seat moves the wizard on to the face-off.
 */
export function CrewStep({ matchId, exitHref }: CrewStepProps) {
  const { match, roles, tkState } = useMatchFlow();
  const { reconcileNow } = useMatchSyncContext();
  const [query, setQuery] = React.useState("");
  const reloadRef = React.useRef<() => void>(() => undefined);
  const viewerId = roles.me?.athleteId ?? "";
  const request = useCrewRequest({ matchId, viewerId, roles, tkState, onRequestEnded: () => reloadRef.current() });
  const picker = useCrewCandidates({ matchId, onAsked: request.noteAsked, onStale: reconcileNow });
  reloadRef.current = picker.reload;
  const { me, opponent } = roles;
  const { status } = request;
  return (
    <View testID="crew-step" style={{ gap: 16 }}>
      <CrewTopBar
        matchId={matchId}
        exitHref={exitHref}
        leave={{ text: SHIPPED_COPY.leave.text, a11y: SHIPPED_COPY.leave.a11y }}
      />
      {me && opponent ? (
        <FaceoffChip
          me={me}
          opponent={opponent}
          myWeight={ratedWeightOf(tkState, me.athleteId)}
          opponentWeight={ratedWeightOf(tkState, opponent.athleteId)}
        />
      ) : null}
      <CrewHeading deadlineAt={match.timekeeper_deadline_at} />
      {status?.kind === "request" ? (
        <RequestCard request={status.request} withdrawing={request.withdrawing} onWithdraw={request.withdraw} />
      ) : status?.kind === "line" ? (
        <AttentionLine testID="crew-status-line" text={status.text} />
      ) : null}
      <CandidateList
        candidates={picker.candidates}
        loadError={picker.loadError}
        onRetry={picker.reload}
        query={query}
        onQuery={setQuery}
        viewerIsChallenger={me?.isChallenger ?? true}
        otherShort={opponent?.shortName ?? ""}
        busy={picker.busy}
        asking={picker.asking}
        canAsk={request.canAsk && picker.asking == null}
        onAsk={picker.ask}
      />
    </View>
  );
}
