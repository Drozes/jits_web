/**
 * Fixtures for the timekeeper-mode face-off tests (slice M3): a seated
 * timekeeper-mode match (challenger `ch-1` "Mina Reyes", opponent `op-1`
 * "Dan Okafor", timekeeper `tk-1` "Jo Cruz"), its timekeeper-mode state, and
 * the match flow (`MatchFlowProvider`'s value) for any of the three viewers,
 * with the roles derived the way the wizard derives them.
 */
import type { MatchDetails } from "@jits/shared/api/queries";
import type { TimekeeperCheckStatus, TimekeeperMatchState, TimekeeperStartBlocker } from "@jits/shared/api/timekeeper";
import { deriveMatchRoles, type MatchRoles } from "@/lib/match-flow/match-roles";
import type { FaceoffParams } from "@/lib/match-flow/use-faceoff";

export const CH = "ch-1";
export const OP = "op-1";
export const TK = "tk-1";

/** "M. Reyes", "D. Okafor", "J. Cruz" on screen (`shortName`). */
export const NAMES = { [CH]: "Mina Reyes", [OP]: "Dan Okafor", [TK]: "Jo Cruz" } as const;

const participant = (id: string, weight: number) => ({
  athlete_id: id,
  display_name: NAMES[id as keyof typeof NAMES],
  current_elo: 1500,
  current_weight: weight,
  profile_photo_url: null,
  role: "competitor",
  outcome: null,
  elo_before: null,
  elo_after: null,
  elo_delta: null,
  weight_division_gap: null,
});

/**
 * A pending timekeeper-mode match with `tk-1` seated (`seated` false: nobody
 * seated yet); `subFlag` is the `tk_weight_check_required` snapshot (A19);
 * `named` false: the read carries the seat but not the timekeeper's identity
 * (an older backend), so their name reads blank.
 */
export function tkMatch({
  subFlag = true,
  seated = true,
  named = true,
}: { subFlag?: boolean; seated?: boolean; named?: boolean } = {}): MatchDetails {
  return {
    id: "M1",
    challenge_id: "C1",
    session_id: null,
    match_type: "ranked",
    duration_seconds: 300,
    status: "pending",
    result: null,
    started_at: null,
    completed_at: null,
    paused_at: null,
    total_paused_duration: 0,
    timekeeper_id: seated ? TK : null,
    // The opponent first on purpose: roles put the challenger first by challenger_id.
    participants: [participant(OP, 171.4), participant(CH, 172.5)],
    requires_timekeeper: true,
    tk_weight_check_required: subFlag,
    challenger_id: CH,
    timekeeper: seated && named ? { id: TK, display_name: NAMES[TK], profile_photo_url: null } : null,
  } as unknown as MatchDetails;
}

/** The timekeeper-mode state of that match (`get_timekeeper_match_state`, parsed). */
export function tkState(over: {
  ready?: string[];
  athleteChecks?: [checker: string, subject: string, status: "pending" | "confirmed" | "flagged" | "recheck"][];
  timekeeperChecks?: [subject: string, status: TimekeeperCheckStatus][];
  startBlockers?: TimekeeperStartBlocker[];
  timeoutAt?: string | null;
  weights?: { [athleteId: string]: number | null };
  /** The seated timekeeper's heartbeat as the server reads it (TK-D7 after 60 s without one). */
  presence?: "online" | "offline" | null;
} = {}): TimekeeperMatchState {
  const weights = over.weights ?? { [CH]: 168, [OP]: 170.2 };
  const presence = over.presence === undefined ? "online" : over.presence;
  return {
    ready: (over.ready ?? []).map((athleteId) => ({ athleteId, readyAt: "2026-10-21T12:00:00.000Z" })),
    athleteChecks: (over.athleteChecks ?? []).map(([checkerId, subjectId, status]) => ({ checkerId, subjectId, status })),
    timekeeperChecks: (over.timekeeperChecks ?? []).map(([subjectId, status]) => ({ subjectId, status })),
    openRequest: null,
    lastRequestOutcome: null,
    presence,
    offlineSince: presence === "offline" ? "2026-10-21T12:03:00.000Z" : null,
    noContestAt: null,
    reviewPending: false,
    timeoutAt: over.timeoutAt === undefined ? "2026-10-21T12:10:00.000Z" : over.timeoutAt,
    weights: [CH, OP].map((athleteId) => ({ athleteId, weight: weights[athleteId] ?? null })),
    editOpen: false,
    editClosesAt: null,
    startBlockers: over.startBlockers ?? ["athletes_not_ready", "weight_check_pending"],
  };
}

export interface TkFlow {
  match: MatchDetails;
  roles: MatchRoles;
  tkState: TimekeeperMatchState | null;
}

/** The match flow for `viewerId` (an athlete or the timekeeper). */
export function tkFlow(
  viewerId: string,
  {
    subFlag = true,
    state = tkState(),
    seated = true,
    named = true,
  }: { subFlag?: boolean; state?: TimekeeperMatchState | null; seated?: boolean; named?: boolean } = {},
): TkFlow {
  const match = tkMatch({ subFlag, seated, named });
  const roles = deriveMatchRoles(match, viewerId);
  if (!roles) throw new Error(`tkFlow: ${viewerId} has no role in the match`);
  return { match, roles, tkState: state };
}

/**
 * The face-off provider's props as the wizard mounts it for the timekeeper
 * (`match-flow-wizard.tsx`): inactive, no phase and no opponent; it gives the
 * timekeeper's header its Leave and their Start its claim.
 */
export function timekeeperFaceoffProps(flow: TkFlow, exitHref = "/arena"): Omit<FaceoffParams, "weightChecks"> {
  return {
    active: false,
    phase: null,
    matchId: flow.match.id,
    exitHref,
    meId: TK,
    opponentId: "",
    myWeight: null,
    opponentWeight: null,
    weightsRated: false,
    onWeighedIn: () => {},
    onStarted: () => {},
    onCancelledRemotely: () => {},
    flow,
  };
}
