/**
 * App-wide store for the signed-in athlete's still-open match (F10).
 *
 * Two surfaces show the same fact: Home's "Resume your match" card (jits-r9a)
 * and the header chip's `▪ CONFIRM` marker (spec 4.3), which is on every tab
 * root. One module value read through `useSyncExternalStore` keeps them in
 * agreement and costs one read per trigger instead of one per mounted
 * screen. The source is unchanged: `getMyActiveMatch()`, no new RPC.
 *
 * A pending result NEVER changes live state. This store only reports the
 * match; it has no path into the live state machine.
 *
 * Reads are triggered by:
 *  - the owner (`useActiveMatchOwner`, mounted once by `<ArenaBootstrap />`):
 *    on mount, on every match exit, on every return from the background, and
 *    on any realtime UPDATE to the match it holds (the opponent recording or
 *    confirming from their phone while this athlete is on another tab);
 *  - any screen through `refreshMyActiveMatch` (Home re-reads on focus).
 * Requests in the same tick (a match exit wakes the owner and Home at once)
 * share one read. A read writes only if nothing newer has written yet, so a
 * slower older read never overwrites a newer one, but an older good read
 * still lands when a newer one fails.
 */
import * as React from "react";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { getMyActiveMatch, type MyActiveMatch } from "@jits/shared/api/queries";
import { supabase } from "@/lib/supabase/client";
import { superviseChannel, type SupervisedChannel } from "@/lib/supabase/supervise-channel";
import { getLeftMatchIds, useIsArenaLive, useMatchExitCount } from "@/lib/arena/arena-store";

interface Snapshot {
  /** Whose match this is; a read for another athlete never shows. */
  athleteId: string | null;
  match: MyActiveMatch | null;
}

const EMPTY: Snapshot = Object.freeze({ athleteId: null, match: null });

let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();
/** Bumped per issued read (and per sign-out clear). */
let seq = 0;
/**
 * The seq of the last read (or clear) that wrote. A result writes only when
 * its seq is newer, like `usePendingChallenges`: a newer read that fails or
 * rejects does not throw away an older read that succeeded.
 */
let lastAppliedSeq = 0;
/** The athlete the newest read was issued for; an older read for anyone else never writes. */
let latestAthleteId: string | null = null;
/** The athlete a read was already issued for in this tick. */
let queuedFor: string | null = null;

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

function write(next: Snapshot): void {
  // Nearly every read is unchanged (usually null): only a real change wakes
  // the readers.
  if (
    next.athleteId === snapshot.athleteId &&
    JSON.stringify(next.match) === JSON.stringify(snapshot.match)
  ) {
    return;
  }
  snapshot = next;
  for (const l of listeners) l();
}

/**
 * Re-read the athlete's open match. Never navigates, never toasts: a failed
 * read keeps what is on screen (Home already toasts its own load failure).
 * Matches the athlete left in this app process are excluded, so a match they
 * backed out of on purpose is not offered again; a kill clears that set,
 * which is exactly the case Resume exists for.
 */
export function refreshMyActiveMatch(athleteId: string | null | undefined): void {
  if (!athleteId) {
    seq += 1;
    lastAppliedSeq = seq;
    latestAthleteId = null;
    queuedFor = null;
    write(EMPTY);
    return;
  }
  if (queuedFor === athleteId) return;
  // Issued now; further requests for this athlete in the same tick share it
  // (a match exit wakes the owner and Home together).
  queuedFor = athleteId;
  void Promise.resolve().then(() => {
    if (queuedFor === athleteId) queuedFor = null;
  });
  const id = ++seq;
  latestAthleteId = athleteId;
  const left = [...getLeftMatchIds()];
  void getMyActiveMatch(supabase, athleteId, Date.now(), left).then(
    (res) => {
      if (!res.ok || id <= lastAppliedSeq || athleteId !== latestAthleteId) return;
      lastAppliedSeq = id;
      write({ athleteId, match: res.data });
    },
    () => {},
  );
}

/** The open match for `athleteId`, or null (none, or not read yet). */
export function useActiveMatch(athleteId: string | null | undefined): MyActiveMatch | null {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return athleteId && snap.athleteId === athleteId ? snap.match : null;
}

/**
 * Whether an open match counts as a "result to confirm" (the chip's
 * `▪ CONFIRM`, the tab's hollow ring, the strip's RESULT TO CONFIRM).
 *
 * Only `in_progress`. A `pending` match is an accepted challenge nobody has
 * begun (weigh-in or ready check): there is no result yet, so it is Resume
 * material (Home's card) and never CONFIRM.
 *
 * Known limit, by the no-new-RPC rule: mobile keeps an ended match
 * `in_progress` until the result is recorded (it never calls `end_match`),
 * so the database cannot tell "ended, result not recorded yet" (an app
 * closed while the opponent records the result) from "left mid-roll" (an app
 * killed during the timer). Both read as CONFIRM; both need the athlete back in that match to
 * finish it. A recorded result flips the match to `completed`, which
 * `getMyActiveMatch()` does not return, so CONFIRM clears then.
 */
export function isResultToConfirm(match: MyActiveMatch | null): match is MyActiveMatch {
  return match !== null && match.status === "in_progress";
}

/**
 * The chip's `▪ CONFIRM` source: the signed-in athlete's open match when it
 * is a result to confirm (see `isResultToConfirm`). Additive only (decision:
 * a pending result never changes live state).
 *
 * Takes the signed-in athlete's id and, like `useActiveMatch`, shows nothing
 * read for anyone else. The store is cleared when the owner unmounts, but a
 * screen (Home) can write it while no owner is mounted, so without this check
 * the next athlete to sign in could see the last one's CONFIRM until their
 * own first read landed.
 */
export function useMatchToConfirm(
  athleteId: string | null | undefined,
): MyActiveMatch | null {
  const match = useActiveMatch(athleteId);
  return isResultToConfirm(match) ? match : null;
}

/** Per-mount suffix: `supabase.channel(topic)` hands back a live duplicate. */
let channelSeq = 0;

/**
 * Keep the store fresh for the signed-in athlete. Mount ONCE, app-wide
 * (`<ArenaBootstrap />`). Clears the store on unmount (sign-out, athlete
 * switch) so the next athlete never sees the last one's match.
 */
export function useActiveMatchOwner(athleteId: string): void {
  React.useEffect(() => {
    refreshMyActiveMatch(athleteId);
    // Only a return from the background: Control Center and the
    // notification shade report "inactive" and are not a return.
    let wasBackground = false;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        wasBackground = true;
        return;
      }
      if (next !== "active" || !wasBackground) return;
      wasBackground = false;
      refreshMyActiveMatch(athleteId);
    });
    return () => {
      sub.remove();
      refreshMyActiveMatch(null);
    };
  }, [athleteId]);

  // Match exits pop back to tab screens that stayed mounted, so nothing
  // refocuses; the exit is when a match may have finished or been left.
  const exits = useMatchExitCount();
  const seenExits = React.useRef(exits);
  React.useEffect(() => {
    if (exits === seenExits.current) return;
    seenExits.current = exits;
    refreshMyActiveMatch(athleteId);
  }, [exits, athleteId]);

  // The held match changing under us: the opponent recorded the result (it
  // flips to `completed` and drops out of the read) from their own phone
  // while this athlete is on Rankings or Profile. `matches` is published to
  // realtime (jr_be 0840658) and RLS limits the feed to participants. One
  // channel, and only while a match is held; a re-read, never a local patch,
  // so the read stays the single definition of "open".
  //
  // Supervised like the challenge channels (jits-fa9x): a server close
  // rebuilds it, and every SUBSCRIBED after the first (a rebuild or a phoenix
  // rejoin) re-reads, because an UPDATE may have landed while it was down and
  // `▪ CONFIRM` would otherwise stay up until the next foreground.
  //
  // A live phone is held awake, so no foreground would ever restart a channel
  // that gave up: while live it keeps rebuilding, and going live restarts one
  // that gave up while offline.
  const heldMatchId = useActiveMatch(athleteId)?.matchId ?? null;
  const isLive = useIsArenaLive();
  const isLiveRef = React.useRef(isLive);
  isLiveRef.current = isLive;
  const supervisorRef = React.useRef<SupervisedChannel | null>(null);
  React.useEffect(() => {
    if (isLive) supervisorRef.current?.resume();
  }, [isLive]);
  React.useEffect(() => {
    if (!heldMatchId) return;
    let joined = false;
    const supervised = superviseChannel(
      "open match",
      () =>
        supabase
          .channel(`active-match:${heldMatchId}:${++channelSeq}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "matches",
              filter: `id=eq.${heldMatchId}`,
            },
            () => refreshMyActiveMatch(athleteId),
          ),
      () => {
        // The first join follows the read that found this match; any later
        // one may have missed an UPDATE.
        if (joined) refreshMyActiveMatch(athleteId);
        joined = true;
      },
      { keepRetrying: () => isLiveRef.current },
    );
    supervisorRef.current = supervised;
    return () => {
      if (supervisorRef.current === supervised) supervisorRef.current = null;
      supervised();
    };
  }, [heldMatchId, athleteId]);
}

/** Test-only: drop all module state between suites. */
export function __resetActiveMatchStoreForTests(): void {
  snapshot = EMPTY;
  seq = 0;
  lastAppliedSeq = 0;
  latestAthleteId = null;
  queuedFor = null;
  listeners.clear();
}
