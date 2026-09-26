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
 * `looking_for_casual: false`; casual was removed from the product and
 * `get_arena_data` filters on (casual OR ranked), so ranked alone is enough to
 * appear.
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

export interface UseArenaLiveArgs {
  athleteId: string;
  displayName: string;
  currentElo: number;
  /** `athletes.looking_for_ranked` as the auth context last read it. */
  initialRanked: boolean;
  /**
   * True while a match screen is mounted (`arena-store.ts` match counter).
   * The athlete is taken offline for the match and put back afterwards if
   * they were live going in.
   */
  inMatch?: boolean;
}

export interface UseArenaLiveResult {
  isLive: boolean;
  isSaving: boolean;
  /** Toggle. Resolves once the write has settled. */
  toggle: () => Promise<void>;
  /**
   * Go offline without a toast. Resolves true once the flag clear landed.
   * For sign-out, which has to clear the flag while the session still exists.
   */
  goOffline: () => Promise<boolean>;
}

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
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await toggleMatchPreferences(supabase, athleteId, {
      lookingForCasual: false,
      lookingForRanked: ranked,
    });
    if (result.ok) return true;
  }
  return false;
}

export function useArenaLive({
  athleteId,
  displayName,
  currentElo,
  initialRanked,
  inMatch = false,
}: UseArenaLiveArgs): UseArenaLiveResult {
  const [isLive, setIsLive] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

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

  /** One transition toward the current intent. */
  const step = React.useCallback(async (): Promise<boolean> => {
    const { athleteId: id, displayName: name, currentElo: elo } =
      identityRef.current;
    if (!id) return false;

    if (desiredRef.current) {
      // Flag first: presence without the flag would put the athlete in
      // "Online now" for people who already hold the roster, while
      // `get_arena_data` omits them for everyone loading it fresh.
      const ok = await writeLookingFlag(id, true);
      if (!ok) {
        desiredRef.current = false;
        return false;
      }
      actualRef.current = true;
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
    return writeLookingFlag(id, false);
  }, []);

  const reconcile = React.useCallback((): Promise<boolean> => {
    const run = queueRef.current.then(async () => {
      let ok = true;
      // Bounded, because a pass that keeps finding new intent means someone
      // holding down the toggle, not a loop that cannot settle.
      for (let i = 0; i < 4 && desiredRef.current !== actualRef.current; i++) {
        ok = await step();
      }
      return ok;
    });
    queueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, [step]);

  const requestLive = React.useCallback((): Promise<boolean> => {
    desiredRef.current = true;
    return reconcile();
  }, [reconcile]);

  const requestOffline = React.useCallback((): Promise<boolean> => {
    desiredRef.current = false;
    return reconcile();
  }, [reconcile]);

  const toggle = React.useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSaving(true);
    try {
      // Read the INTENT, not the committed state: a tap during an in-flight
      // transition should reverse what was asked for, not what has landed.
      const wantLive = !desiredRef.current;
      const ok = wantLive ? await requestLive() : await requestOffline();
      if (!ok) {
        toast.error(
          wantLive
            ? "Couldn't take you live. Try again."
            : "Couldn't take you offline. Try again.",
        );
      }
    } finally {
      inFlightRef.current = false;
      setIsSaving(false);
    }
  }, [requestLive, requestOffline]);

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
   * Put back a live state that the app, not the athlete, took away. A failure
   * is said out loud: the athlete believes they are live, and nothing else
   * on screen would tell them otherwise.
   */
  const restoreLive = React.useCallback(async () => {
    const ok = await requestLiveRef.current();
    if (!ok) toast.error("You're offline. Go live again in the Arena.");
  }, []);

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
  const reconciledRef = React.useRef(false);
  React.useEffect(() => {
    if (!athleteId || !initialRanked || reconciledRef.current) return;
    reconciledRef.current = true;
    if (inMatchRef.current) {
      // The match effect below issues the clear as it records the resume.
      resumeAfterMatchRef.current = true;
      return;
    }
    if (AppState.currentState !== "active") {
      resumeLiveRef.current = true;
      void requestOffline();
      return;
    }
    // Only the flag is committed; presence has not been joined. Mark it
    // uncommitted so the reconcile loop runs a full transition (flag AND
    // lobby) instead of seeing desired === actual and doing nothing.
    actualRef.current = false;
    void requestLive();
  }, [athleteId, initialRanked, requestLive, requestOffline]);

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
        resumeLiveRef.current = resumeLiveRef.current || desiredRef.current;
        void requestOfflineRef.current();
        return;
      }
      // Put back exactly what the background took away. Without this the
      // athlete comes back silently offline with a toggle that still looks
      // live-capable, and nothing else can fix it: this handler ignores
      // "active" otherwise and the arrival effect is one-shot.
      if (next !== "active" || !resumeLiveRef.current) return;
      resumeLiveRef.current = false;
      if (inMatchRef.current) {
        resumeAfterMatchRef.current = true;
        return;
      }
      void restoreLive();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [restoreLive]);

  // Offline for the length of a match, back afterwards.
  const wasInMatchRef = React.useRef(false);
  React.useEffect(() => {
    if (inMatch === wasInMatchRef.current) return;
    wasInMatchRef.current = inMatch;
    if (inMatch) {
      resumeAfterMatchRef.current =
        resumeAfterMatchRef.current || desiredRef.current || resumeLiveRef.current;
      resumeLiveRef.current = false;
      void requestOfflineRef.current();
      return;
    }
    if (!resumeAfterMatchRef.current) return;
    resumeAfterMatchRef.current = false;
    // Left the match while backgrounded is not possible, but a match screen
    // unmounted by a sign-out teardown is: never go live without a screen.
    if (AppState.currentState !== "active") {
      resumeLiveRef.current = true;
      return;
    }
    void restoreLive();
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

  return { isLive, isSaving, toggle, goOffline: requestOffline };
}
