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
 *     clears them: the AppState handler ignores "active" and the tab-selection
 *     effect cannot fire until they come back.
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
   * Whether the Arena TAB is selected, which is not the same as whether the
   * Arena SCREEN is focused. A pushed athlete profile or match blurs the
   * screen while the tab stays selected, and neither of those is leaving the
   * Arena. See `use-arena-tab-focus.ts`.
   */
  isArenaTabSelected: boolean;
}

export interface UseArenaLiveResult {
  isLive: boolean;
  isSaving: boolean;
  /** Toggle. Resolves once the write has settled. */
  toggle: () => Promise<void>;
}

/**
 * Write the flag, with one retry.
 *
 * `toggleMatchPreferences` returns a `Result`, it does not throw: supabase-js
 * resolves transport failures into `{ data: null, error }` rather than
 * rejecting, so failure is read off the returned value and never off a
 * rejection. The retry exists because the paths that clear the flag (leaving
 * the tab, backgrounding) have no UI left to report into, and a dropped clear
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
  isArenaTabSelected,
}: UseArenaLiveArgs): UseArenaLiveResult {
  const [isLive, setIsLive] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  /** What we intend. Set synchronously by every caller, before any await. */
  const desiredRef = React.useRef(false);
  /** What we have committed: flag written AND presence settled to match. */
  const actualRef = React.useRef(false);
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
      await joinLobby({
        athlete_id: id,
        display_name: name,
        current_elo: elo,
        looking_for_casual: false,
        looking_for_ranked: true,
      });
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

  // Re-assert a flag the athlete arrived with. Writing it again rather than
  // trusting it is deliberate: the auth context caches the athlete row, so a
  // second visit in the same app session can hand us a `true` we ourselves
  // cleared on the way out. Re-writing makes "present in the lobby" and
  // "flagged as looking" true at the same instant, whatever the cache says.
  const reconciledRef = React.useRef(false);
  React.useEffect(() => {
    if (!athleteId || !initialRanked || reconciledRef.current) return;
    reconciledRef.current = true;
    void requestLive();
  }, [athleteId, initialRanked, requestLive]);

  const requestOfflineRef = React.useRef(requestOffline);
  requestOfflineRef.current = requestOffline;
  const requestLiveRef = React.useRef(requestLive);
  requestLiveRef.current = requestLive;
  const isArenaTabSelectedRef = React.useRef(isArenaTabSelected);
  isArenaTabSelectedRef.current = isArenaTabSelected;
  /**
   * Whether the background that just happened took a live athlete down.
   *
   * Read off the INTENT at the moment of backgrounding, which is the whole
   * guard: an athlete who toggled off and then closed the app leaves this
   * false and is never resurrected. It is the defensive clear that gets
   * undone, not a decision the athlete made.
   */
  const resumeLiveRef = React.useRef(false);

  // Leaving the Arena TAB takes the athlete offline. Pushing an athlete
  // profile or dropping into a match does not: the tab is still selected and
  // they have not left the Arena, they are inside it.
  React.useEffect(() => {
    if (isArenaTabSelected) return;
    void requestOfflineRef.current();
  }, [isArenaTabSelected]);

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
        resumeLiveRef.current = desiredRef.current;
        void requestOfflineRef.current();
        return;
      }
      // Put back exactly what the background took away. Without this the
      // athlete comes back silently offline with a toggle that still looks
      // live-capable, and nothing else can fix it: this handler ignores
      // "active" otherwise, the arrival effect is one-shot, and the tab
      // effect only ever takes people offline.
      if (next !== "active" || !resumeLiveRef.current) return;
      resumeLiveRef.current = false;
      // Not if they came back somewhere else. The tab effect owns that case
      // and it has already cleared them.
      if (!isArenaTabSelectedRef.current) return;
      void requestLiveRef.current();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  // A real teardown (sign-out, app shutdown) still clears. With the tab rule
  // above this fires rarely, which is the point: a tab navigator keeps its
  // screens mounted, so unmount alone was never a reliable "they left".
  React.useEffect(() => {
    return () => {
      void requestOfflineRef.current();
    };
  }, []);

  return { isLive, isSaving, toggle };
}
