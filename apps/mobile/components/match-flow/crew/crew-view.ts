/**
 * The picker's pure rules (timekeeper mode spec 4.2 Pick, boards P-TK-B2 and
 * P-TK-B3): which candidates show for a search, which empty state applies,
 * whose friend a row is, and the line or card above the list. No React, no
 * reads: the crew step's hooks feed them.
 */
import type {
  LatestTimekeeperRequest,
  TimekeeperCandidate,
  TimekeeperCandidates,
  TimekeeperMatchState,
} from "@jits/shared/api/timekeeper";
import { shortName } from "@/lib/match-flow/short-name";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";

export interface PickerSections {
  friends: TimekeeperCandidate[];
  nearby: TimekeeperCandidate[];
  /** Search text is typed: an empty section hides with its header (frame B2.2). */
  searching: boolean;
  /**
   * The empty state that replaces the lists: `none` (nobody to ask at all,
   * TK-P14) or `search` (nobody by that name, TK-P15). Null while a list
   * has someone.
   */
  empty: "none" | "search" | null;
}

/** The loaded lists narrowed to a search (case-insensitive, anywhere in the name). */
export function pickerSections(candidates: TimekeeperCandidates, query: string): PickerSections {
  const q = query.trim().toLowerCase();
  const keep = (c: TimekeeperCandidate) => !q || c.displayName.toLowerCase().includes(q);
  const friends = candidates.friends.filter(keep);
  const nearby = candidates.nearby.filter(keep);
  const nobody = candidates.friends.length === 0 && candidates.nearby.length === 0;
  let empty: PickerSections["empty"] = null;
  if (nobody) empty = "none";
  else if (friends.length === 0 && nearby.length === 0) empty = "search";
  return { friends, nearby, searching: q.length > 0, empty };
}

/**
 * TK-P5b: a row says whose friend it is only when it is the OTHER athlete's
 * friend alone (board P-TK-B2 frames 1 and 4): a friend of mine, of both of
 * us, or of nobody (nearby) carries no caption.
 */
export function showsFriendCaption(friendOf: TimekeeperCandidate["friendOf"], viewerIsChallenger: boolean): boolean {
  return friendOf === (viewerIsChallenger ? "opponent" : "challenger");
}

/** The open request as one athlete sees it (the card). */
export interface OpenRequestView {
  requestId: string;
  mine: boolean;
  requesterShort: string;
  inviteeShort: string;
}

/** What sits above the list: the open request's card, a line asking to pick again, or nothing. */
export type CrewStatus = { kind: "request"; request: OpenRequestView } | { kind: "line"; text: string } | null;

export interface CrewStatusInput {
  /** The open request: the server's (`tkState.openRequest`), or this phone's own Ask until the state catches up. */
  openRequest: TimekeeperMatchState["openRequest"];
  lastRequestOutcome: TimekeeperMatchState["lastRequestOutcome"] | null;
  /** The match's newest request, read on mount (`getLatestTimekeeperRequest`). */
  latest: LatestTimekeeperRequest | null;
  viewerId: string;
  /** Short names of the two athletes by id (the requester of an open request is one of them). */
  athleteShort: (athleteId: string) => string;
}

/**
 * The picker's status, newest first: an open request is its card (TK-P17 or
 * TK-P20); otherwise the latest request's outcome asks for another pick:
 * declined TK-P21, lapsed TK-P22 (both from the state), or accepted with
 * nobody seated, which is a pre-start drop-out back to the picker (TK-D1,
 * spec 4.3; the state reports no outcome for an accepted request). TK-D1
 * needs the timekeeper's name, which the direct read leaves empty when RLS
 * hides that athlete (a deleted or suspended account): then no line, never
 * a stand-in name.
 */
export function crewStatus(input: CrewStatusInput): CrewStatus {
  const { openRequest, lastRequestOutcome, latest } = input;
  if (openRequest) {
    return {
      kind: "request",
      request: {
        requestId: openRequest.id,
        mine: openRequest.requestedBy === input.viewerId,
        requesterShort: input.athleteShort(openRequest.requestedBy),
        inviteeShort: shortName(openRequest.invitee.displayName),
      },
    };
  }
  if (lastRequestOutcome) {
    const name = shortName(lastRequestOutcome.inviteeName);
    return { kind: "line", text: lastRequestOutcome.status === "declined" ? C["TK-P21"](name) : C["TK-P22"](name) };
  }
  if (latest?.status === "accepted" && latest.inviteeName.trim()) {
    return { kind: "line", text: C["TK-D1"](shortName(latest.inviteeName)) };
  }
  return null;
}
