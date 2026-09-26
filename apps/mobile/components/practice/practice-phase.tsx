import * as React from "react";
import { EndStep } from "@/components/match-flow/steps/end-step";
import type { AthleteGuardRow } from "@jits/shared/api/queries";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import { practiceBot } from "@/lib/practice/constants";
import type { PracticeAction, PracticeState } from "@/lib/practice/use-practice-match";
import { PracticeConfirm, PracticeLobby, PracticeReady, PracticeWeight } from "./practice-steps";
import { PracticeLive } from "./practice-live";
import { PracticeResult } from "./practice-result";
import { PracticeSummary } from "./practice-summary";

/** Renders the current practice phase and wires its taps to the reducer. */
export function PracticePhaseView({
  state,
  dispatch,
  athlete,
  submissionTypes,
  onArena,
  onDone,
  onAgain,
}: {
  state: PracticeState;
  dispatch: React.Dispatch<PracticeAction>;
  athlete: Pick<AthleteGuardRow, "id" | "current_elo" | "current_weight">;
  submissionTypes: SubmissionType[];
  onArena: () => void;
  onDone: () => void;
  onAgain: () => void;
}) {
  const { phase } = state;
  const onEnded = React.useCallback(() => dispatch({ type: "ENDED" }), [dispatch]);
  switch (phase) {
    case "offline":
    case "lobby":
    case "waiting":
      return (
        <PracticeLobby
          phase={phase}
          bot={practiceBot(athlete)}
          onGoLive={() => dispatch({ type: "GO_LIVE" })}
          onGoOffline={() => dispatch({ type: "GO_OFFLINE" })}
          onChallenge={() => dispatch({ type: "CHALLENGE" })}
          onCancel={() => dispatch({ type: "CANCEL" })}
        />
      );
    case "weight":
      return (
        <PracticeWeight
          weight={athlete.current_weight}
          onConfirm={() => dispatch({ type: "CONFIRM_WEIGHTS" })}
        />
      );
    case "ready":
      return (
        <PracticeReady
          userReady={state.userReady}
          botReady={state.botReady}
          onReady={() => dispatch({ type: "USER_READY" })}
          onCancel={() => dispatch({ type: "CANCEL" })}
        />
      );
    case "live":
      return (
        <PracticeLive
          onEnd={(finishSeconds) => dispatch({ type: "END_MATCH", finishSeconds })}
        />
      );
    case "end":
      return <EndStep onAdvance={onEnded} />;
    case "result":
      return (
        <PracticeResult
          athleteId={athlete.id}
          submissionTypes={submissionTypes}
          initialFinishSeconds={state.finishSeconds ?? undefined}
          onSubmit={(result) => dispatch({ type: "SUBMIT_RESULT", result })}
        />
      );
    case "confirm":
      return (
        <PracticeConfirm
          result={state.result}
          athleteId={athlete.id}
          botConfirmed={state.botConfirmed}
          onConfirm={() => dispatch({ type: "USER_CONFIRM" })}
        />
      );
    case "summary":
      return (
        <PracticeSummary
          result={state.result}
          athleteId={athlete.id}
          onArena={onArena}
          onDone={onDone}
          onAgain={onAgain}
        />
      );
  }
}
