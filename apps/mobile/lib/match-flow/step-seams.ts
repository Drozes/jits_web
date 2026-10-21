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
import type { MatchAthleteView, MatchCaps, MatchRoles } from "./match-roles";
import type { MatchStep } from "./step-router";
import { TIMEKEEPER_COPY } from "./timekeeper-copy";

/** One athlete's rated weight (lbs), null until known (PM26). */
export interface RatedWeight {
  athleteId: string;
  lbs: number | null;
}

/**
 * What the live screen shows about the seated timekeeper (spec 4.2 Live,
 * 4.3; slice M4): the clock-runner line, the offline banner and the
 * no-contest countdown, from `roles` and the timekeeper-mode state.
 */
export interface LiveTimekeeperSeam {
  /**
   * The seated timekeeper's athlete id: an athlete's phone freezes on a
   * received `match_ended` only when its `actor_id` is this one (spec 4.2
   * End, PM1); any other end only re-reads (M-R8).
   */
  id: string;
  /** The timekeeper's short name (TK-L2 `{NAME} RUNS THE CLOCK`, TK-D7). */
  name: string;
  /** This viewer may leave the seat from the live screen (`caps.leave`, TK-K16): the timekeeper only. */
  canLeave: boolean;
  /** An athlete's phone, and the server reads the timekeeper as offline (TK-D7). */
  offline: boolean;
  /** When the running match becomes a no contest: its pause timeout or the offline one (TK-D9); else null. */
  timeoutAt: string | null;
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
    /** Who ends the clock, when it is not this viewer's opponent: the timekeeper, by short name (the deck's `{NAME}`). */
    endedByName?: string;
    /** Three phones run the countdown once a timekeeper is in the match (TK-L0). */
    countdownCaption?: string;
    /** How this phone ends the clock (`caps.endVia`; ARCHITECTURE 2.3 "End"). */
    endVia: MatchCaps["endVia"];
    /** A timekeeper-mode match with a seated timekeeper; absent in a two-athlete match. */
    timekeeper?: LiveTimekeeperSeam;
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
   * The face-off before the start (spec 4.3 "Seated, before start"; slice
   * M4 builds the input, M3 mounts it): the seated timekeeper's short name
   * while an athlete's phone reads them offline (TK-D7, after 60 s without a
   * heartbeat), else null (the timekeeper's own phone, online, nobody seated,
   * a two-athlete match, or before the state lands). TK-D7 has no chip of
   * its own there: the face-off's TK-D9 already counts down, so the athlete
   * face-off renders `<TimekeeperOfflineBanner name={...} />` without `chip`.
   */
  faceoff: { timekeeperOfflineName: string | null };
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
  const seated = roles.timekeeper;
  const waits = caps.resultEntry === "wait";
  const athleteViewer = me != null && opponent != null;
  // The timekeeper's athletes on their rated weights (PM26), challenger first.
  const onRated = (a: MatchAthleteView): MatchAthleteView => ({ ...a, weightLbs: ratedWeightOf(tkState, a.athleteId) });
  const pair: readonly [MatchAthleteView, MatchAthleteView] = athleteViewer
    ? [me, opponent]
    : [onRated(roles.athletes[0]), onRated(roles.athletes[1])];
  const rated = (a: MatchAthleteView): RatedWeight => ({ athleteId: a.athleteId, lbs: a.weightLbs });
  // An athlete's read of the seated timekeeper's heartbeat (TK-D7); the timekeeper never sees themselves offline.
  const timekeeperOffline = athleteViewer && seated != null && tkState?.presence === "offline";
  return {
    pair,
    live: {
      controls: caps.canPauseEnd ? "full" : "none",
      // Whoever runs the clock ends it: the opponent by default, else the timekeeper.
      endedByName: caps.canPauseEnd ? undefined : (seated?.shortName ?? ""),
      countdownCaption: roles.timekeeper ? TIMEKEEPER_COPY["TK-L0"] : undefined,
      endVia: caps.endVia,
      timekeeper: seated
        ? {
            id: seated.id,
            name: seated.shortName,
            canLeave: caps.leave === "timekeeper_seat",
            offline: timekeeperOffline,
            timeoutAt: tkState?.timeoutAt ?? null,
          }
        : undefined,
    },
    afterLive: waits ? "result" : "end",
    resultEntry: waits ? { entryPolicy: "wait", recorderName: timekeeperName } : { entryPolicy: caps.resultEntry },
    confirmRecorderName: waits ? timekeeperName : undefined,
    faceoff: { timekeeperOfflineName: timekeeperOffline && seated ? seated.shortName : null },
    ratedWeights: athleteViewer ? undefined : [rated(pair[0]), rated(pair[1])],
  };
}
