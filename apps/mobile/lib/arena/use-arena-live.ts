/**
 * "Go live" for the Arena: the `looking_for_ranked` flag and `lobby:online`
 * presence, owned by one hook so they cannot drift apart.
 *
 * Why one hook. The Arena renders two lists off two different signals:
 * "Online now" comes from Presence, "Open to challenges" comes from the DB
 * flag. Presence drops by itself when the socket goes away, but the flag does
 * not, so anything that takes down the channel without also clearing the flag
 * leaves the athlete parked in "Open to challenges" forever, unreachable and
 * advertised as available.
 *
 * The shape is desired-state reconciliation rather than a pair of imperative
 * methods, for two reasons that are really the same reason:
 *
 *  1. INTENT IS RECORDED SYNCHRONOUSLY. Writing the flag is a round trip, and
 *     it can be two. If "am I live?" only became true after that await, a
 *     background landing inside the window would find nothing to clear, return
 *     happy, and leave an athlete live and unreachable with no path that ever
 *     clears them: the AppState handler only ever re-asserts live on
 *     "active", it never clears there.
 *  2. TRANSITIONS ARE SERIALIZED. Two unordered writes can reach the database
 *     in either order, so a clear racing a set can lose and leave the flag
 *     true. Every transition runs on one promise queue, so the clear is issued
 *     only after the set has landed.
 *
 * The two signals are NOT symmetric, and going offline is written around that:
 * presence lapses by itself when the socket dies, the column does not, so on
 * the way out the flag write is the one that must go out and the untrack is
 * the one that can be left to finish or not. See `step()`.
 *
 * Ranked only. `toggleMatchPreferences` always writes
 * `looking_for_casual: false` (the server forces it false anyway since
 * jr_be-ahn.1); every match is ranked and `get_arena_data` filters on
 * `looking_for_ranked`, so ranked is what makes an athlete appear.
 *
 * Mounted ONCE for the signed-in athlete, by `<ArenaBootstrap />`
 * (`lib/arena/arena-bootstrap.tsx`), and read everywhere else through
 * `arena-store.ts`. A second mount would be a second writer racing this one's
 * queue, so screens must never call it directly.
 */
import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { toggleMatchPreferences } from "@jits/shared/api/mutations";
import { toast } from "@/components/ui/toast";
import { supabase } from "../supabase/client";
import { joinLobby, leaveLobby } from "./use-lobby-presence";
import type { LiveSwitchDirection } from "./arena-store";
import { GO_OFFLINE_FAILED_MESSAGE } from "./constants";
import {
  abandonTappedGoLive,
  areLiveWritesBlocked,
  getArenaDisplayLive,
  getLiveIntent,
  isLiveDriverBusy,
  isTappedGoLiveInFlight,
  setAppLiveIntent,
} from "./arena-store";
import {
  arrivalDecision,
  PERSISTED_INTENT_READ_BOUND_MS,
  type PersistedLiveIntent,
} from "./live-intent-persist";

/** The athlete's (or the app's) last choice is offline: nothing may put them back live. */
function intentHoldsOffline(): boolean {
  const i = getLiveIntent();
  return i.decided && !i.live;
}

/**
 * Whether a resume (foreground, after a match) should put the athlete back:
 * the decided intent when there is one (review round 3: the athlete's last
 * choice), else what the app was doing (`fallback`).
 */
function resumeFromIntent(fallback: boolean): boolean {
  const i = getLiveIntent();
  return i.decided ? i.live : fallback;
}

export interface UseArenaLiveArgs {
  athleteId: string;
  displayName: string;
  /** Null when the athlete has no rating; tracked as null, never as 0. */
  currentElo: number | null;
  /** `athletes.looking_for_ranked` as the auth context last read it. */
  initialRanked: boolean;
  /**
   * True while a match screen is mounted (`arena-store.ts` match counter).
   * The athlete is taken offline for the match and put back afterwards if
   * they were live going in.
   */
  inMatch?: boolean;
  /**
   * The athlete is going offline ON PURPOSE: `toggle` turning live off, or
   * `goOffline` (the popover, sign-out). Called synchronously before the
   * transition starts; the function it may return is called once the
   * transition settled, with whether it took the athlete offline: the
   * committed live state is off, which is what the athlete sees (grey chip,
   * gone from the lobby), even when the flag clear itself failed. NOT called when the app takes them offline
   * (backgrounding, entering a match), which is the whole distinction:
   * a manual go-offline drops a challenge tucked into the chip, a trip to
   * the home screen does not (decision Q3).
   */
  onManualOffline?: () => ((wentOffline: boolean) => void) | void;
  /**
   * Runs before a go-live the athlete did not tap (return to the foreground,
   * after a match, the arrival re-assert). With `match_location_required` on
   * it reports a fresh `go_live` reading, without asking, so the server
   * accepts the live write. Resolving `false` means "do not write live"
   * (location permission is gone, live location fixes 1b): the athlete
   * stays offline and the caller has already offered the tap-to-go-live
   * CTA. Anything else goes ahead. Never rejects.
   */
  beforeAutoLive?: () => Promise<boolean | void>;
  /**
   * The athlete's last choice persisted for this athlete (review rounds 3
   * and 4). A cold start that finds `looking_for_ranked` true clears it
   * (and is drawn offline from the first frame) when that choice was offline
   * and its clear never landed; otherwise (live, unknown, or an offline whose
   * clear landed, so the server's session is newer, e.g. web) it restores.
   * Waited on for at most `PERSISTED_INTENT_READ_BOUND_MS`. Never rejects.
   */
  loadPersistedIntent?: () => Promise<PersistedLiveIntent | null>;
  /**
   * A `looking_for_ranked = false` write landed (the owner confirms a
   * persisted offline choice with it, round 4).
   */
  onOfflineLanded?: () => void;
  /**
   * Instant go-live (jr_be 016 addendum 4.2): runs a WHOLE automatic
   * restore, live writes included, through the location ladder (the server
   * may refuse rung 1's write and the ladder then reports a tag and writes
   * again). Replaces `beforeAutoLive` when given. `ctx.write` is the
   * serialized live write; `ctx.canWrite` says whether a write may go out
   * now ("parked": the app went to the background or into a match, hand the
   * intent on; "cancelled": the athlete went offline meanwhile). The ladder
   * shows its own toast on failure. Never rejects.
   */
  autoLive?: (ctx: AutoLiveContext) => Promise<"live" | "failed" | "parked" | "cancelled">;
  /**
   * The app went to the background and took a live athlete down, meaning to
   * restore them on return (UX 019, 3i: the owner may draw the restore from
   * the first frame back).
   */
  onResumeParked?: () => void;
}

export interface AutoLiveContext {
  write: () => Promise<boolean>;
  lastRefusal: () => "location_required" | null;
  canWrite: () => "ok" | "parked" | "cancelled";
  /** What brought the restore on. */
  reason: "foreground" | "match" | "arrival";
}

export interface UseArenaLiveResult {
  isLive: boolean;
  isSaving: boolean;
  /**
   * Which way a transition is heading while one is running and the intent
   * differs from what is committed, null otherwise. Set for ANY live
   * transition in flight, the athlete's own toggle included, and in
   * particular for the ones the athlete did not start (restoring live on
   * return to the foreground or after a match, the arrival re-assert), which
   * `isSaving` does not cover: the
   * live switch reads this so it is locked, and labelled with where it is
   * going, while one of those is in flight. Otherwise a tap on "Go live"
   * during a restore would reach `toggle`, which reverses the INTENT (live)
   * and would take the athlete offline.
   */
  transition: LiveSwitchDirection | null;
  /**
   * The last go-live attempt failed its flag write, whichever path started
   * it (toggle, goLive, a foreground or post-match restore, the arrival
   * re-assert). Cleared by the next transition that lands, either way, and
   * by any later offline intent (entering a match, backgrounding, a
   * go-offline), even one with nothing to write. The
   * chip's `○ OFFLINE · RETRY` (AC-H11) reads this through the store.
   */
  lastWriteFailed: boolean;
  /** Toggle. Resolves once the write has settled. */
  toggle: () => Promise<void>;
  /**
   * Go offline without a toast. Resolves true once the flag clear landed.
   * For sign-out, which has to clear the flag while the session still exists.
   */
  goOffline: () => Promise<boolean>;
  /**
   * Go live, idempotently: sets the intent to live (never reverses it the
   * way `toggle` does) and resolves true once it landed. For flows that want
   * the athlete live whatever the current intent.
   */
  goLive: () => Promise<boolean>;
  /**
   * Why the last go-live write was refused, when the server said:
   * `location_required` (flag on, no fresh `go_live` reading). Null after a
   * write that landed or failed for any other reason (network).
   */
  lastGoLiveRefusal: () => "location_required" | null;
  /**
   * The server may end a live session by itself (`expire_stale_live_sessions`
   * when the `go_live` readings stop, live location fixes D7). While live
   * with nothing in flight, `read` asks the server; if it says the flag is
   * off and nothing moved meanwhile, the app drops to offline too (presence
   * untracked, no flag write: it is already off) instead of showing LIVE
   * for an athlete nobody can challenge. Resolves true when it dropped.
   */
  dropIfServerOffline: (read: () => Promise<boolean | null>) => Promise<boolean>;
  /**
   * What is committed on the server: `live`, and `settled` (nothing in flight
   * and the request matches it). The intent driver reads it (review round 3).
   */
  committed: () => { live: boolean; settled: boolean };
  /** Bring the server offline (an app decision: no manual go-offline side effects). */
  ensureOffline: () => Promise<boolean>;
  /**
   * Sign-out (round 4, R1): ALWAYS writes `false` at once, whatever the hook
   * believes is committed (a failed clear can leave the server live while
   * the app reads offline), plus the usual serialized go-offline behind any
   * write in flight. Resolves with the immediate write's outcome.
   */
  signOutOffline: () => Promise<boolean>;
  /**
   * The periodic own-row check (round 4): with nothing in flight, read the
   * server's `looking_for_ranked` and correct ANY disagreement with what is
   * drawn. "dropped": drawn (or committed) live, server false, now offline
   * (the caller says so). "cleared": the last choice is offline but the
   * server still says live, a clear went out. "adopted": no offline choice,
   * the app offline, the server live (a session started elsewhere): put back
   * live. Null: nothing to correct, or something moved during the read.
   */
  checkServer: (read: () => Promise<boolean | null>) => Promise<"dropped" | "cleared" | "adopted" | null>;
}

/**
 * How long after a failed flag clear the first follow-up clear goes out. The
 * app is already offline (presence untracked, grey chip), but the column
 * still says "looking", so other athletes and web keep listing this athlete
 * until it lands. Round 4 (R1): it keeps retrying while in the foreground,
 * doubling up to `CLEAR_RETRY_MAX_MS`; every foreground tries again at once.
 */
export const CLEAR_RETRY_MS = 5_000;
/** The longest wait between follow-up clears. */
export const CLEAR_RETRY_MAX_MS = 60_000;

/** Longest a transition waits on joining the lobby's presence. */
const LOBBY_CALL_BOUND_MS = 12_000;

/**
 * Wait for `work`, but never longer than `ms`, and never reject: a presence
 * failure is logged and survivable, a stuck or rejected transition is not.
 */
async function settleWithin(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work.catch((error: unknown) => {
        console.warn("[arena] joining the lobby failed:", error);
      }),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          console.warn("[arena] joining the lobby did not settle; moving on");
          resolve();
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Write the flag, with one retry.
 *
 * `toggleMatchPreferences` returns a `Result`, it does not throw: supabase-js
 * resolves transport failures into `{ data: null, error }` rather than
 * rejecting, so failure is read off the returned value and never off a
 * rejection. The retry exists because the paths that clear the flag
 * (backgrounding, sign-out, teardown) have no UI left to report into, and a dropped clear
 * is the exact bug this hook exists to prevent.
 */
async function writeLookingFlag(
  athleteId: string,
  ranked: boolean,
  onRefused?: (reason: "location_required") => void,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await toggleMatchPreferences(supabase, athleteId, {
      lookingForCasual: false,
      lookingForRanked: ranked,
    });
    if (result.ok) return true;
    // A refusal the same write cannot fix (no fresh go_live reading while
    // match_location_required is on): no retry, the caller explains it.
    if (result.error?.code === "LOCATION_REQUIRED") {
      onRefused?.("location_required");
      return false;
    }
  }
  return false;
}

export function useArenaLive({
  athleteId,
  displayName,
  currentElo,
  initialRanked,
  inMatch = false,
  onManualOffline,
  beforeAutoLive,
  autoLive,
  onResumeParked,
  loadPersistedIntent,
  onOfflineLanded,
}: UseArenaLiveArgs): UseArenaLiveResult {
  const [isLive, setIsLive] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [transition, setTransition] = React.useState<LiveSwitchDirection | null>(
    null,
  );
  const [lastWriteFailed, setLastWriteFailedState] = React.useState(false);
  const setLastWriteFailed = React.useCallback((failed: boolean) => {
    setLastWriteFailedState(failed);
  }, []);

  /** What we intend. Set synchronously by every caller, before any await. */
  const desiredRef = React.useRef(false);
  /**
   * What we have committed: flag written AND presence settled to match.
   *
   * Seeded from the row, not from `false` (jits-yiwx): a `true` the athlete
   * arrived with IS committed in the database, so a clear requested before
   * any go-live (cold launch straight into a match, a silent-push background
   * launch) must actually write `false`. Seeded `false`, that clear looked
   * like a no-op and the stale flag stayed up for the whole match, leaving
   * the athlete challengeable from web. The foreground arrival path resets
   * it before going live, because presence is NOT yet joined.
   */
  const actualRef = React.useRef(initialRanked);
  /** Serializes transitions so their writes cannot reach the DB out of order. */
  const queueRef = React.useRef<Promise<unknown>>(Promise.resolve());
  /** UI-level double-tap guard; `isSaving` is still false across the await. */
  const inFlightRef = React.useRef(false);

  const identityRef = React.useRef({ athleteId, displayName, currentElo });
  identityRef.current = { athleteId, displayName, currentElo };
  const manualOfflineRef = React.useRef(onManualOffline);
  manualOfflineRef.current = onManualOffline;
  const beforeAutoLiveRef = React.useRef(beforeAutoLive);
  beforeAutoLiveRef.current = beforeAutoLive;
  const autoLiveRef = React.useRef(autoLive);
  autoLiveRef.current = autoLive;
  const onResumeParkedRef = React.useRef(onResumeParked);
  const loadPersistedIntentRef = React.useRef(loadPersistedIntent);
  loadPersistedIntentRef.current = loadPersistedIntent;
  const onOfflineLandedRef = React.useRef(onOfflineLanded);
  onOfflineLandedRef.current = onOfflineLanded;
  onResumeParkedRef.current = onResumeParked;
  /**
   * Bumped only by a go-offline the ATHLETE asked for (`manualOffline`: the
   * toggle, the popover, the Arena bar, sign-out), so a restore in flight can
   * tell "cancelled" from the app's own offline writes (background, a match),
   * which park it instead (review round 1, B2).
   */
  const offlineIntentRef = React.useRef(0);
  /** Automatic restores (`autoLive`) running: single-flight (SF1), so 0 or 1. */
  const restoreInFlightRef = React.useRef(0);
  /** The server's reason for the last refused go-live write, if it gave one. */
  const refusalRef = React.useRef<"location_required" | null>(null);

  /**
   * The server may still say "looking" while the app holds offline (round 4,
   * R1): a clear failed, a go-live write failed without a definite refusal
   * (it may have committed all the same), or the athlete arrived with a
   * `true`. While set, an offline intent always writes `false` again (never
   * "desired equals committed, nothing to do"). Cleared by a write that
   * lands, either way.
   */
  const clearFailedRef = React.useRef(initialRanked);
  const clearRetryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRetryDelayRef = React.useRef(CLEAR_RETRY_MS);
  const retryFailedClearRef = React.useRef<() => void>(() => undefined);
  /** A `false` write landed: the server is offline, and a persisted offline choice is confirmed. */
  const offlineLanded = React.useCallback(() => {
    clearFailedRef.current = false;
    clearRetryDelayRef.current = CLEAR_RETRY_MS;
    if (clearRetryTimerRef.current) {
      clearTimeout(clearRetryTimerRef.current);
      clearRetryTimerRef.current = null;
    }
    try {
      onOfflineLandedRef.current?.();
    } catch {
      // Best effort.
    }
  }, []);
  /** Next follow-up clear, with backoff, only while in front (the foreground handler retries at once). */
  const scheduleClearRetry = React.useCallback(() => {
    if (clearRetryTimerRef.current) clearTimeout(clearRetryTimerRef.current);
    clearRetryTimerRef.current = null;
    if (AppState.currentState === "background") return;
    const delay = clearRetryDelayRef.current;
    clearRetryDelayRef.current = Math.min(delay * 2, CLEAR_RETRY_MAX_MS);
    clearRetryTimerRef.current = setTimeout(() => {
      clearRetryTimerRef.current = null;
      retryFailedClearRef.current();
    }, delay);
  }, []);
  React.useEffect(
    () => () => {
      if (clearRetryTimerRef.current) clearTimeout(clearRetryTimerRef.current);
    },
    [],
  );

  /** One transition toward the current intent. */
  const step = React.useCallback(async (): Promise<boolean> => {
    const { athleteId: id, displayName: name, currentElo: elo } =
      identityRef.current;
    if (!id) return false;

    if (desiredRef.current) {
      // Flag first: presence without the flag would put the athlete in
      // "Online now" for people who already hold the roster, while
      // `get_arena_data` omits them for everyone loading it fresh.
      refusalRef.current = null;
      // Sign-out has started, or the last choice is offline: no live write,
      // ever (review round 3). The intent is the one source of truth.
      if (areLiveWritesBlocked() || intentHoldsOffline()) {
        desiredRef.current = false;
        return false;
      }
      const ok = await writeLookingFlag(id, true, (reason) => {
        refusalRef.current = reason;
      });
      if (!ok) {
        desiredRef.current = false;
        // Without a definite refusal the write may have committed all the
        // same (the answer was lost): the server may say live (R1).
        if (refusalRef.current !== "location_required") clearFailedRef.current = true;
        return false;
      }
      actualRef.current = true;
      clearFailedRef.current = false;
      clearRetryDelayRef.current = CLEAR_RETRY_MS;
      setIsLive(true);

      // Intent can flip during that round trip. Tracking now would raise a
      // presence row the next pass has to take straight back down, so leave
      // it to the loop, which clears both halves instead.
      if (!desiredRef.current) return true;
      // Bounded (jits-fa9x). Presence is best-effort and the flag above is
      // authoritative, so a presence call that never settles must not hold
      // this serialized queue: behind it the toggle would spin forever and
      // the go-offline on match entry would never write the flag.
      await settleWithin(
        joinLobby({
          athlete_id: id,
          display_name: name,
          current_elo: elo,
          looking_for_casual: false,
          looking_for_ranked: true,
        }),
        LOBBY_CALL_BOUND_MS,
      );
      return true;
    }

    // CONCURRENT, not sequential, and deliberately so. `leaveLobby()` awaits
    // `channel.untrack()`, which is a presence SEND: it takes the websocket
    // push branch, and on a socket that is not connected the push is buffered
    // with its timeout already running and resolves 'timed out' only after
    // ten seconds. Awaiting it here spends the little time a backgrounded app
    // has on the half that heals itself (presence lapses when the socket
    // dies) and defers the half that does not (the column survives), so iOS
    // suspends the process with `looking_for_ranked` still true and the
    // athlete parked in "Open to challenges" with the app closed.
    //
    // Issuing the untrack first still closes the challengeable window as
    // early as possible; not awaiting it is what keeps the durable write from
    // queueing behind ten seconds of dead socket.
    actualRef.current = false;
    setIsLive(false);
    void leaveLobby().catch((error: unknown) => {
      // Presence failing is survivable, the flag write is not, so this must
      // never reject the transition. Said out loud rather than swallowed.
      console.warn("[arena] leaving the lobby failed:", error);
    });
    const cleared = await writeLookingFlag(id, false);
    // A failed clear still commits offline here (above), so nothing in the
    // UI offers a go-offline to retry it: retry it in the background, and
    // every later offline intent writes again (R1).
    if (cleared) offlineLanded();
    else {
      clearFailedRef.current = true;
      scheduleClearRetry();
    }
    return cleared;
  }, [scheduleClearRetry, offlineLanded]);

  /** Reconcile passes queued or running (for `transition`). */
  const pendingRef = React.useRef(0);
  const syncTransition = React.useCallback(() => {
    const desired = desiredRef.current;
    setTransition(
      pendingRef.current > 0 && desired !== actualRef.current
        ? desired
          ? "going-live"
          : "going-offline"
        : null,
    );
  }, []);

  /** Bumped by every reconcile, so a server read can tell nothing moved under it. */
  const generationRef = React.useRef(0);

  /** Count of failed go-live writes; see `reconcile`. */
  const goLiveFailuresRef = React.useRef(0);

  const reconcile = React.useCallback((): Promise<boolean> => {
    pendingRef.current += 1;
    generationRef.current += 1;
    // Failed go-live writes so far. A pass whose intent was dropped reports a
    // failure only when one landed AFTER it was enqueued (a go-live queued
    // ahead of it), never one left over from an earlier, unrelated attempt.
    const failuresBefore = goLiveFailuresRef.current;
    syncTransition();
    // The intent this pass was ENQUEUED for. Read at start instead, a go-live
    // queued behind a failing go-live would see the `desiredRef = false` that
    // failure left behind and wipe the failure it should be reporting.
    const intent = desiredRef.current;
    const run = queueRef.current.then(async () => {
      let ok = true;
      // An offline intent reconciled, even as a no-op (a failed go-live has
      // already left the athlete offline, so entering a match or backgrounding
      // finds nothing to write): the failure is behind them now, and the
      // chip must not keep offering RETRY for it hours later.
      if (!intent && !desiredRef.current) setLastWriteFailed(false);
      // Bounded, because a pass that keeps finding new intent means someone
      // holding down the toggle, not a loop that cannot settle.
      // A pass enqueued for an offline intent, while the server may still say
      // live, writes `false` once whatever is committed locally (R1). (A
      // failed go-live does not clear in its own pass: the offline intent
      // that follows it does.)
      let forcedClear = false;
      const needsWrite = () =>
        desiredRef.current !== actualRef.current ||
        (!intent && !desiredRef.current && clearFailedRef.current && !forcedClear);
      for (let i = 0; i < 4 && needsWrite(); i++) {
        if (!desiredRef.current) forcedClear = true;
        syncTransition();
        const goingLive = desiredRef.current;
        ok = await step();
        if (goingLive && !ok) goLiveFailuresRef.current += 1;
        // Only a failed go-live is "last write failed": a failed clear still
        // leaves the athlete offline in the app (see `step`), and any pass
        // that lands clears the flag.
        setLastWriteFailed(goingLive && !ok);
      }
      // A go-live that found nothing to do because the go-live queued ahead
      // of it failed (and dropped the intent) did not land either: report
      // the failure to its caller too, rather than a silent success.
      if (intent && !desiredRef.current && !actualRef.current) {
        return goLiveFailuresRef.current === failuresBefore && ok;
      }
      return ok;
    });
    queueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    void queueRef.current.then(() => {
      pendingRef.current -= 1;
      syncTransition();
    });
    return run;
  }, [step, syncTransition, setLastWriteFailed]);

  /**
   * Clear a stale `looking_for_ranked = true` the athlete arrived with and
   * that the app did not put back: one write of false, serialized behind any
   * transition, skipped if the athlete has chosen live by the time it runs
   * (their live write sets the flag anyway). It never pretends the flag is
   * live (review round 3: a forced `actualRef` could leave the executor
   * believing a flag the server no longer had).
   */
  const clearStaleArrival = React.useCallback((): Promise<void> => {
    const run = queueRef.current.then(async () => {
      const id = identityRef.current.athleteId;
      if (!id || desiredRef.current || actualRef.current) return;
      if (await writeLookingFlag(id, false)) offlineLanded();
      else {
        clearFailedRef.current = true;
        scheduleClearRetry();
      }
    });
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    queueRef.current = settled;
    return settled;
  }, [scheduleClearRetry, offlineLanded]);

  const requestLive = React.useCallback((): Promise<boolean> => {
    desiredRef.current = true;
    return reconcile();
  }, [reconcile]);

  const requestOffline = React.useCallback((): Promise<boolean> => {
    desiredRef.current = false;
    return reconcile();
  }, [reconcile]);

  /**
   * The follow-up clear: an offline intent while the server may still say
   * live. Through the reconcile loop, so it is serialized like every write.
   */
  retryFailedClearRef.current = () => {
    if (clearRetryTimerRef.current) {
      clearTimeout(clearRetryTimerRef.current);
      clearRetryTimerRef.current = null;
    }
    if (!clearFailedRef.current || desiredRef.current) return;
    void reconcile();
  };
  const retryFailedClear = React.useCallback(() => retryFailedClearRef.current(), []);

  /**
   * A go-offline the athlete asked for. The hook is told before (so nothing
   * new is offered on the way out) and after, with whether the athlete is now
   * offline. That is read off the COMMITTED state, not the flag write: the
   * offline branch of `step` commits offline and untracks presence before the
   * write, so a clear that fails twice still leaves the athlete offline as
   * far as they (grey chip) and the lobby can tell, and a tucked challenge
   * then drops as decision Q3 says. Only a go-offline that never committed
   * (the intent flipped back to live meanwhile) keeps it.
   */
  const manualOffline = React.useCallback(async (): Promise<boolean> => {
    // The athlete's own go-offline: a restore in flight is cancelled by it,
    // and nothing parked earlier may put them back live (review round 3, X1).
    offlineIntentRef.current += 1;
    resumeLiveRef.current = false;
    resumeAfterMatchRef.current = false;
    const settle = manualOfflineRef.current?.();
    let ok = false;
    try {
      ok = await requestOffline();
    } finally {
      if (typeof settle === "function") {
        settle(!actualRef.current && !desiredRef.current);
      }
    }
    return ok;
  }, [requestOffline]);

  const toggle = React.useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSaving(true);
    try {
      // Read the INTENT, not the committed state: a tap during an in-flight
      // transition should reverse what was asked for, not what has landed.
      const wantLive = !desiredRef.current;
      const ok = wantLive ? await requestLive() : await manualOffline();
      if (!ok) {
        // Neutral, never red: a live-flag write failure is ink-3 (spec 3).
        toast.info(
          wantLive
            ? "Couldn't take you live. Try again."
            : GO_OFFLINE_FAILED_MESSAGE,
        );
      }
    } finally {
      inFlightRef.current = false;
      setIsSaving(false);
    }
  }, [requestLive, manualOffline]);

  /** Sign-out (R1): an unconditional `false` now, plus the serialized go-offline. */
  const signOutOffline = React.useCallback(async (): Promise<boolean> => {
    const id = identityRef.current.athleteId;
    // Whatever is committed locally, the server may say live: the queued
    // pass below writes `false` too, behind any write in flight.
    clearFailedRef.current = true;
    desiredRef.current = false;
    const queued = manualOffline();
    if (!id) return queued;
    let direct = false;
    try {
      direct = await writeLookingFlag(id, false);
    } catch {
      direct = false;
    }
    if (direct) offlineLanded();
    return direct;
  }, [manualOffline, offlineLanded]);

  const requestOfflineRef = React.useRef(requestOffline);
  requestOfflineRef.current = requestOffline;
  const requestLiveRef = React.useRef(requestLive);
  requestLiveRef.current = requestLive;
  const inMatchRef = React.useRef(inMatch);
  inMatchRef.current = inMatch;
  /**
   * Whether the background that just happened took a live athlete down.
   *
   * Read off the INTENT at the moment of backgrounding, which is the whole
   * guard: an athlete who toggled off and then closed the app leaves this
   * false and is never resurrected. It is the defensive clear that gets
   * undone, not a decision the athlete made.
   */
  const resumeLiveRef = React.useRef(false);
  /** Same idea for a match: whether going into it is what took them down. */
  const resumeAfterMatchRef = React.useRef(false);

  /**
   * `beforeAutoLive`, bounded so a stuck reading cannot hold a restore.
   * Resolves false only when it said "do not write live"; a reading that
   * timed out goes ahead, as before.
   */
  const runBeforeAutoLive = React.useCallback(async (): Promise<boolean> => {
    const before = beforeAutoLiveRef.current;
    if (!before) return true;
    let proceed = true;
    await settleWithin(
      before().then((r) => {
        if (r === false) proceed = false;
      }),
      LOBBY_CALL_BOUND_MS,
    );
    return proceed;
  }, []);

  /**
   * Run the owner's `autoLive` (the location ladder), with the write, the
   * refusal reason and the gate it needs. "parked" hands the intent to the
   * next foreground / the end of the match.
   */
  const runAutoLive = React.useCallback(
    async (reason: AutoLiveContext["reason"]): Promise<"live" | "failed" | "parked" | "cancelled"> => {
      const run = autoLiveRef.current;
      if (!run) return "failed";
      // The last choice is offline: never put back live (review round 3).
      if (intentHoldsOffline()) return "cancelled";
      const offlineAtStart = offlineIntentRef.current;
      restoreInFlightRef.current += 1;
      try {
        return await run({
          write: () => requestLiveRef.current(),
          lastRefusal: () => refusalRef.current,
          canWrite: () => {
            // Backgrounding and entering a match park the restore; only the
            // athlete's own go-offline cancels it.
            if (AppState.currentState !== "active" || inMatchRef.current) return "parked";
            if (offlineIntentRef.current !== offlineAtStart && !desiredRef.current) return "cancelled";
            if (intentHoldsOffline() || areLiveWritesBlocked()) return "cancelled";
            return "ok";
          },
          reason,
        });
      } catch (error: unknown) {
        console.warn("[arena] restoring live failed:", error);
        return "failed";
      } finally {
        restoreInFlightRef.current -= 1;
      }
    },
    [],
  );

  /**
   * A restore run ended without putting the athlete live (cancelled by an
   * earlier offline choice, or parked), but the athlete's LAST choice is live
   * and nothing is moving: resume it now (in front, out of a match) or at the
   * next foreground (review round 3: the intent decides, never a stale run).
   */
  const restoreLiveRef = React.useRef<(reason: AutoLiveContext["reason"]) => Promise<void>>(async () => {});
  const resumeIfUnmet = React.useCallback(() => {
    const i = getLiveIntent();
    if (!i.decided || !i.live || actualRef.current || desiredRef.current) return;
    if (restoreInFlightRef.current > 0) return;
    if (AppState.currentState !== "active" || inMatchRef.current) {
      if (inMatchRef.current) resumeAfterMatchRef.current = true;
      else resumeLiveRef.current = true;
      return;
    }
    void restoreLiveRef.current("foreground");
  }, []);

  /**
   * Put back a live state that the app, not the athlete, took away. A failure
   * is said out loud: the athlete believes they are live, and nothing else
   * on screen would tell them otherwise.
   */
  const restoreLive = React.useCallback(async (reason: AutoLiveContext["reason"] = "foreground") => {
    if (autoLiveRef.current) {
      let r = await runAutoLive(reason);
      // Not met though it should be: parked (the app went away mid-step), or
      // a "live" whose write was overtaken by the app's own offline write
      // (the background) so nothing landed. Back in front and out of a
      // match (the "active" handler left it to this run, SF1): carry on,
      // here; still away: hand it to the next foreground.
      for (let i = 0; i < 2; i++) {
        const unmet = r === "parked" || (r === "live" && !actualRef.current);
        if (!unmet || intentHoldsOffline()) break;
        if (AppState.currentState === "active" && !inMatchRef.current) {
          r = await runAutoLive(reason);
          continue;
        }
        r = "parked";
        break;
      }
      // Failed while the app was not in front: the ladder could say nothing
      // (no toast in the background), so the live intent is not dropped
      // silently; the next foreground tries again, and says it then.
      const notInFront = r === "failed" && AppState.currentState !== "active";
      if (r === "cancelled") {
        // Cancelled by an earlier offline choice: a later live choice wins.
        resumeIfUnmet();
        return;
      }
      if (r !== "parked" && !notInFront) return;
      if (inMatchRef.current) resumeAfterMatchRef.current = true;
      else resumeLiveRef.current = true;
      return;
    }
    const proceed = await runBeforeAutoLive();
    // Backgrounded (or into a match) during that reading: hand the intent
    // to the next foreground / the end of the match, never go live unseen.
    if (AppState.currentState !== "active" || inMatchRef.current) {
      if (inMatchRef.current) resumeAfterMatchRef.current = true;
      else resumeLiveRef.current = true;
      return;
    }
    // Location permission is gone: no live write the server would refuse.
    // The athlete stays offline; `beforeAutoLive` offered the tap to go live.
    if (!proceed) return;
    const ok = await requestLiveRef.current();
    if (!ok) toast.info("You're offline. Go live again in the Arena.");
  }, [runBeforeAutoLive, runAutoLive, resumeIfUnmet]);
  restoreLiveRef.current = restoreLive;

  // Re-assert a flag the athlete arrived with. This hook is mounted once per
  // signed-in athlete (by `<ArenaBootstrap />`), so `initialRanked` is the row
  // as it stood at sign-in or cold start. A `true` there means the last clear
  // never landed (the process was killed before the background write left
  // the device) or the athlete is live on web. Re-writing it rather than
  // trusting it makes "present in the lobby" and "flagged as looking" true at
  // the same instant, and the header LIVE pill makes the state visible, so
  // nobody is silently advertised.
  //
  // Only in the FOREGROUND. A silent push (remote-notification background
  // mode) can cold-launch the JS with the app never shown, and going live
  // then would advertise an athlete whose app is closed. In that case the
  // intent is parked and the first "active" restores it. Same for a launch
  // straight into a match: it waits for the match to end. In both parked
  // cases the stale `true` is CLEARED now (the flag is seeded as committed,
  // see `actualRef`), so nobody can challenge an athlete who cannot answer.
  //
  // ONCE, on arrival, with the value captured at mount. The post-match
  // `refreshAthleteSoft` hands this hook a fresh `looking_for_ranked` as a new
  // prop; re-running on it would be an extra flag write and lobby track
  // (presence is rate limited), or would force back live an athlete who had
  // just tapped offline. After mount, this hook's own state is the truth.
  const arrivedRankedRef = React.useRef(initialRanked);
  const reconciledRef = React.useRef(false);
  React.useEffect(() => {
    if (!athleteId || reconciledRef.current) return;
    reconciledRef.current = true;
    if (!arrivedRankedRef.current) return;
    if (inMatchRef.current) {
      // The match effect below issues the clear as it records the resume.
      resumeAfterMatchRef.current = true;
      return;
    }
    if (AppState.currentState !== "active") {
      resumeLiveRef.current = true;
      void requestOfflineRef.current();
      return;
    }
    // Only the flag is committed; presence has not been joined. Mark it
    // uncommitted so the reconcile loop runs a full transition (flag AND
    // lobby) instead of seeing desired === actual and doing nothing. The
    // server still says live (`clearFailedRef`, seeded from the row), so an
    // offline choice meanwhile still writes `false` (R1).
    actualRef.current = false;
    if (autoLiveRef.current) {
      void (async () => {
        // The athlete's last choice before the kill was offline and its
        // clear never landed: the `true` is stale. Held offline (drawn
        // offline, no LIVE frame) and cleared, never restored (round 4).
        // An offline whose clear landed means the server's live session is
        // newer (web): adopted, restored like any server-live arrival.
        let persisted: PersistedLiveIntent | null = null;
        const load = loadPersistedIntentRef.current;
        if (load) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            persisted = await Promise.race([
              load().catch(() => null),
              new Promise<null>((resolve) => {
                timer = setTimeout(() => resolve(null), PERSISTED_INTENT_READ_BOUND_MS);
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        }
        if (arrivalDecision(persisted) === "clear") {
          if (!getLiveIntent().decided) setAppLiveIntent(false);
          return "cancelled" as const;
        }
        let r = await runAutoLive("arrival");
        // Came back in front while the run was mid-step: carry on once (SF1).
        if (r === "parked" && AppState.currentState === "active" && !inMatchRef.current) {
          r = await runAutoLive("arrival");
        }
        return r;
      })().then((r) => {
        // Live, and it really is: done. (A "live" whose write the app's own
        // offline write overtook, the background, is not.)
        if (r === "live" && actualRef.current) return;
        const notInFront = r === "failed" && AppState.currentState !== "active";
        if (r === "parked" || notInFront) {
          if (inMatchRef.current) resumeAfterMatchRef.current = true;
          else resumeLiveRef.current = true;
        }
        // Every other outcome (failed, parked, cancelled): the arrived `true`
        // is still committed in the database (presence is not). Clear it, so
        // nobody can challenge an athlete the app could not put back (B2).
        // Not when the athlete has tapped Go live meanwhile: that intent wins.
        if (!desiredRef.current) {
          // Then the athlete's last choice decides (a live choice made after
          // an earlier offline one that cancelled this restore wins).
          void clearStaleArrival().then(() => resumeIfUnmet());
        }
      });
      return;
    }
    if (!beforeAutoLiveRef.current) {
      void requestLiveRef.current();
      return;
    }
    void runBeforeAutoLive().then((proceed) => {
      if (AppState.currentState !== "active" || inMatchRef.current || !proceed) {
        if (inMatchRef.current) resumeAfterMatchRef.current = true;
        else if (proceed) resumeLiveRef.current = true;
        // The arrived `true` is still committed in the database (presence is
        // not): mark it so, so this clear actually writes `false` instead of
        // reading as a no-op and leaving the athlete advertised. Not when the
        // athlete has tapped Go live meanwhile: that intent wins.
        if (!desiredRef.current) {
          actualRef.current = true;
          void requestOfflineRef.current();
        }
        return;
      }
      void requestLiveRef.current();
    });
  }, [athleteId, runBeforeAutoLive, runAutoLive, resumeIfUnmet, clearStaleArrival]);

  // THE LIFECYCLE. Live belongs to the athlete, not to a screen:
  //  - Switching tabs or pushing a profile: still live. The header LIVE pill
  //    says so on every screen, and the app-wide challenge prompt means a
  //    live athlete on Home or Rankings still gets their challenges.
  //  - Entering a match: offline for the match (nobody can answer a prompt
  //    mid-roll), and live again when the match screen is left, if they were
  //    live going in. KNOWN, by design (jits-yiwx): "the match screen" is any
  //    mounted `match/[matchId]`, and that includes watching the match video
  //    from the summary step, so an athlete replaying their roll stays
  //    offline (no prompts, not in "Open to challenges") until they leave
  //    the match screen.
  //  - Backgrounding: offline (below). The app can no longer answer a prompt.
  //  - Foregrounding: live again, wherever they land, if and only if the
  //    background is what took them down, and not while still in a match
  //    (that intent is handed to the end of the match instead).
  //  - Sign-out or teardown of the authenticated app: offline.
  //
  // Backgrounding is the case web gets wrong: the socket dies on its own and
  // presence lapses, but the flag survives and keeps advertising an athlete
  // who has closed the app.
  React.useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      // Clear on "background" only. iOS also reports "inactive" for the
      // notification shade, Control Center, an incoming-call banner, a system
      // alert and a half-swiped app switcher, none of which mean the athlete
      // left.
      if (next === "background") {
        // A restore still running (a silent fix) has not set the intent yet:
        // the background must not lose it (B2).
        // A tapped go-live that has not landed is cancelled by the
        // background (its flow aborts), never restored on return (QA B).
        if (isTappedGoLiveInFlight() && !actualRef.current) abandonTappedGoLive();
        // Derived from the athlete's last choice (review round 3): offline
        // (even if not written yet) never resumes.
        resumeLiveRef.current = resumeFromIntent(
          resumeLiveRef.current || desiredRef.current || restoreInFlightRef.current > 0,
        );
        void requestOfflineRef.current();
        if (resumeLiveRef.current && !inMatchRef.current) onResumeParkedRef.current?.();
        return;
      }
      // Put back exactly what the background took away. Without this the
      // athlete comes back silently offline with a toggle that still looks
      // live-capable, and nothing else can fix it: this handler ignores
      // "active" otherwise and the arrival effect is one-shot.
      if (next === "active") retryFailedClear();
      if (next !== "active") return;
      // A live choice that is not met (it was still waiting when the app
      // went away) resumes too: the intent, not a stale ref, decides.
      const i = getLiveIntent();
      const unmetChoice = i.decided && i.live && !actualRef.current && !desiredRef.current;
      if (!resumeLiveRef.current && !unmetChoice) return;
      resumeLiveRef.current = false;
      if (intentHoldsOffline()) return;
      if (inMatchRef.current) {
        resumeAfterMatchRef.current = true;
        return;
      }
      // Single-flight (SF1): a restore still running (the app went away and
      // came back before it finished) carries on now that it may write; a
      // second one alongside it would race it.
      if (restoreInFlightRef.current > 0) return;
      void restoreLive("foreground");
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [restoreLive, retryFailedClear]);

  // Offline for the length of a match, back afterwards.
  const wasInMatchRef = React.useRef(false);
  React.useEffect(() => {
    if (inMatch === wasInMatchRef.current) return;
    wasInMatchRef.current = inMatch;
    if (inMatch) {
      // A tapped go-live that has not landed is dropped by the match.
      if (isTappedGoLiveInFlight() && !actualRef.current) abandonTappedGoLive();
      resumeAfterMatchRef.current = resumeFromIntent(
        resumeAfterMatchRef.current || desiredRef.current || resumeLiveRef.current,
      );
      resumeLiveRef.current = false;
      void requestOfflineRef.current();
      return;
    }
    if (!resumeAfterMatchRef.current) return;
    resumeAfterMatchRef.current = false;
    if (intentHoldsOffline()) return;
    // Left the match while backgrounded is not possible, but a match screen
    // unmounted by a sign-out teardown is: never go live without a screen.
    if (AppState.currentState !== "active") {
      resumeLiveRef.current = true;
      return;
    }
    void restoreLive("match");
  }, [inMatch, restoreLive]);

  // A real teardown (sign-out, switching athlete, app shutdown) still clears.
  // Sign-out ALSO clears ahead of time through
  // `takeArenaOfflineBeforeSignOut()`, because by the time this runs the
  // session is gone and RLS refuses the write.
  React.useEffect(() => {
    return () => {
      void requestOfflineRef.current();
    };
  }, []);

  const dropIfServerOffline = React.useCallback(
    async (read: () => Promise<boolean | null>): Promise<boolean> => {
      const settled = () => desiredRef.current && actualRef.current && pendingRef.current === 0;
      if (!settled()) return false;
      const generation = generationRef.current;
      let serverLive: boolean | null = null;
      try {
        serverLive = await read();
      } catch {
        return false;
      }
      // Only a definite "off", and only if no transition started meanwhile
      // (a go-live landing during the read must win).
      if (serverLive !== false || generation !== generationRef.current || !settled()) return false;
      desiredRef.current = false;
      actualRef.current = false;
      resumeLiveRef.current = false;
      setIsLive(false);
      setLastWriteFailed(false);
      void leaveLobby().catch((error: unknown) => {
        console.warn("[arena] leaving the lobby failed:", error);
      });
      return true;
    },
    [setLastWriteFailed],
  );

  const checkServer = React.useCallback(
    async (read: () => Promise<boolean | null>): Promise<"dropped" | "cleared" | "adopted" | null> => {
      const idle = () =>
        pendingRef.current === 0 && restoreInFlightRef.current === 0 && !isLiveDriverBusy() && !inMatchRef.current;
      if (!idle()) return null;
      const generation = generationRef.current;
      let serverLive: boolean | null = null;
      try {
        serverLive = await read();
      } catch {
        return null;
      }
      if (serverLive === null || generation !== generationRef.current || !idle()) return null;
      const i = getLiveIntent();
      if (serverLive === false) {
        // The server is offline: anything we feared it still said, it does not.
        if (!desiredRef.current) {
          clearFailedRef.current = false;
          clearRetryDelayRef.current = CLEAR_RETRY_MS;
        }
        const drawnLive = getArenaDisplayLive();
        if (!actualRef.current && !drawnLive) return null;
        // Drawn (or committed) live, the server says no: offline now.
        desiredRef.current = false;
        actualRef.current = false;
        resumeLiveRef.current = false;
        setIsLive(false);
        setLastWriteFailed(false);
        void leaveLobby().catch((error: unknown) => {
          console.warn("[arena] leaving the lobby failed:", error);
        });
        return "dropped";
      }
      // The server says live.
      if (actualRef.current && desiredRef.current) return null;
      if (i.decided && !i.live && clearFailedRef.current) {
        // An offline choice whose clear has not landed: the `true` is ours,
        // stale. Cleared.
        void requestOffline();
        return "cleared";
      }
      if (AppState.currentState !== "active") return null;
      // The app offline (any offline choice acknowledged by the server), the
      // server live: a session started after it, elsewhere (web). The newer
      // choice wins, as on arrival (R2): the app follows it.
      if (i.decided && !i.live) setAppLiveIntent(true);
      void restoreLive("foreground");
      return "adopted";
    },
    [requestOffline, restoreLive, setLastWriteFailed],
  );

  return {
    isLive,
    isSaving,
    transition,
    lastWriteFailed,
    toggle,
    goOffline: manualOffline,
    goLive: requestLive,
    lastGoLiveRefusal: React.useCallback(() => refusalRef.current, []),
    dropIfServerOffline,
    ensureOffline: requestOffline,
    signOutOffline,
    checkServer,
    committed: React.useCallback(
      () => ({
        live: actualRef.current,
        // Offline with the server possibly still live is not settled (R1).
        settled:
          pendingRef.current === 0 &&
          desiredRef.current === actualRef.current &&
          !(!desiredRef.current && clearFailedRef.current),
      }),
      [],
    ),
  };
}
