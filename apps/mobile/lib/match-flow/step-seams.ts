/**
 * What the step renderer hands the shared steps for this viewer (timekeeper
 * mode ARCHITECTURE 2.3): the policy seams' inputs, read from `roles.caps`,
 * the seated timekeeper and, for the timekeeper's weights, the
 * timekeeper-mode state, so a two-athlete match passes exactly the defaults
 * the steps had before (full live controls, no ended-by name or countdown
 * caption, the end step after live, claim-first result entry, the shipped
 * confirm reading, the athletes' own weights). Pure: one place maps
 * capabilities to step props, and `match-step-renderer.tsx` only places the
 * steps.
 *
 * The timekeeper's weights (PM26): every timekeeper screen that shows or
 * quotes a weight takes the athletes' rated weights from the
 * timekeeper-mode state, never the profile weight (`current_weight`, which
 * `roles` carries as `weightLbs` and a re-weigh leaves alone). So the
 * timekeeper's `pair` carries them as `weightLbs` (the live screen's athlete
 * bars and countdown chip, the result form) and `ratedWeights` lists them
 * for the face-off (its verdicts quote them as `weightSeen`). Both are null
 * until the state lands, and for a side the challenge holds no weight for.
 */
import { ratedWeightOf, type TimekeeperMatchState } from "@jits/shared/api/timekeeper";
import type { MatchAthleteView, MatchRoles } from "./match-roles";
import type { MatchStep } from "./step-router";
import { TIMEKEEPER_COPY } from "./timekeeper-copy";

/** One athlete's rated weight (lbs), null until known (PM26). */
export interface RatedWeight {
  athleteId: string;
  lbs: number | null;
}

export interface StepSeams {
  /**
   * The pair the live and result screens show: an athlete sees themselves
   * and their opponent (from `roles`, unchanged), the timekeeper the two
   * athletes, challenger first, each with `weightLbs` set to their rated
   * weight (PM26; null until known, never the profile weight).
   */
  pair: readonly [MatchAthleteView, MatchAthleteView];
  live: {
    controls: "full" | "none";
    /** Who ends the clock, when it is not this viewer's opponent (the timekeeper). */
    endedByName?: string;
    /** Three phones run the countdown once a timekeeper is in the match (TK-L0). */
    countdownCaption?: string;
  };
  /**
   * Where the live step's end goes: straight to the result waiting view for
   * an athlete someone else records for (spec 6.2, no "record the result"
   * end screen), else the end step as always.
   */
  afterLive: Extract<MatchStep, "end" | "result">;
  /** The result step's entry policy, with the recorder named when this phone waits. */
  resultEntry: { entryPolicy: "claim" | "sole" } | { entryPolicy: "wait"; recorderName: string };
  /** The confirm step's recorder (the timekeeper); undefined keeps the shipped reading. */
  confirmRecorderName?: string;
  /**
   * The timekeeper's weights, in `pair` order (challenger first): each
   * athlete's rated weight from the timekeeper-mode state (BE-G3, PM26), null
   * until that read lands or while the challenge holds none for them; the
   * same values as the timekeeper's `pair[i].weightLbs`. Never the profile
   * weight: the timekeeper's face-off verdicts quote these as `weightSeen`
   * and the server refuses any other. Undefined for an athlete, whose
   * weights come from their own challenge read (`useWizardWeights`), as
   * before.
   */
  ratedWeights?: readonly [RatedWeight, RatedWeight];
}

export function stepSeams(roles: MatchRoles, tkState: TimekeeperMatchState | null = null): StepSeams {
  const { me, opponent, caps } = roles;
  const timekeeperName = roles.timekeeper?.name ?? "";
  const waits = caps.resultEntry === "wait";
  const athleteViewer = me != null && opponent != null;
  // The timekeeper's athletes on their rated weights (PM26), challenger first.
  const onRated = (a: MatchAthleteView): MatchAthleteView => ({ ...a, weightLbs: ratedWeightOf(tkState, a.athleteId) });
  const pair: readonly [MatchAthleteView, MatchAthleteView] = athleteViewer
    ? [me, opponent]
    : [onRated(roles.athletes[0]), onRated(roles.athletes[1])];
  const rated = (a: MatchAthleteView): RatedWeight => ({ athleteId: a.athleteId, lbs: a.weightLbs });
  return {
    pair,
    live: {
      controls: caps.canPauseEnd ? "full" : "none",
      // Whoever runs the clock ends it: the opponent by default, else the timekeeper.
      endedByName: caps.canPauseEnd ? undefined : timekeeperName,
      countdownCaption: roles.timekeeper ? TIMEKEEPER_COPY["TK-L0"] : undefined,
    },
    afterLive: waits ? "result" : "end",
    resultEntry: waits ? { entryPolicy: "wait", recorderName: timekeeperName } : { entryPolicy: caps.resultEntry },
    confirmRecorderName: waits ? timekeeperName : undefined,
    ratedWeights: athleteViewer ? undefined : [rated(pair[0]), rated(pair[1])],
  };
}
