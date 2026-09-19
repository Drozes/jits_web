/**
 * "Go live" for the Arena: the `looking_for_ranked` flag and `lobby:online`
 * presence, owned by one hook so they cannot drift apart.
 *
 * Why one hook. The Arena renders two lists off two different signals:
 * "Online now" comes from Presence, "Open to challenges" comes from the DB
 * flag. Presence drops by itself when the socket goes away, but the flag does
 * not, so anything that takes down the channel without also clearing the flag
 * leaves the athlete parked in "Open to challenges" forever, unreachable and
 * advertised as available. Every path that changes one of the two here changes
 * both.
 *
 * Ranked only. `toggleMatchPreferences` always writes
 * `looking_for_casual: false`; casual was removed from the product and
 * `get_arena_data` filters on (casual OR ranked), so ranked alone is enough to
 * appear.
 */
import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useFocusEffect } from "expo-router";
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
 * the surface, backgrounding) have no UI left to report into, and a dropped
 * clear is the exact bug this hook exists to prevent.
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
}: UseArenaLiveArgs): UseArenaLiveResult {
  const [isLive, setIsLive] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Synchronous, because React state is not. `isSaving` is still false for the
  // whole await below, so only a ref set before it closes the double-tap
  // window.
  const inFlightRef = React.useRef(false);
  const isLiveRef = React.useRef(false);
  const identityRef = React.useRef({ athleteId, displayName, currentElo });
  identityRef.current = { athleteId, displayName, currentElo };

  const setLive = React.useCallback((next: boolean) => {
    isLiveRef.current = next;
    setIsLive(next);
  }, []);

  const goLive = React.useCallback(async (): Promise<boolean> => {
    const { athleteId: id, displayName: name, currentElo: elo } =
      identityRef.current;
    if (!id) return false;

    // Flag first: presence without the flag would put the athlete in "Online
    // now" for people who already have the roster, while `get_arena_data`
    // omits them entirely for everyone loading it fresh.
    const ok = await writeLookingFlag(id, true);
    if (!ok) return false;

    setLive(true);
    await joinLobby({
      athlete_id: id,
      display_name: name,
      current_elo: elo,
      looking_for_casual: false,
      looking_for_ranked: true,
    });
    return true;
  }, [setLive]);

  const goOffline = React.useCallback(async (): Promise<boolean> => {
    if (!isLiveRef.current) return true;
    const { athleteId: id } = identityRef.current;

    // Presence first here: it is local and instant, so the window where the
    // athlete is still challengeable closes immediately, and the flag write
    // that follows only has to catch the slower list up.
    setLive(false);
    await leaveLobby();
    return writeLookingFlag(id, false);
  }, [setLive]);

  const toggle = React.useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSaving(true);
    try {
      const wasLive = isLiveRef.current;
      const ok = wasLive ? await goOffline() : await goLive();
      if (!ok) {
        toast.error(
          wasLive
            ? "Couldn't take you offline. Try again."
            : "Couldn't take you live. Try again.",
        );
      }
    } finally {
      inFlightRef.current = false;
      setIsSaving(false);
    }
  }, [goLive, goOffline]);

  // Re-assert a flag the athlete already had set. Writing it again rather than
  // trusting it is deliberate: the auth context caches the athlete row, so a
  // second visit in the same app session can hand us a `true` we ourselves
  // cleared on the way out. Re-writing makes "present in the lobby" and
  // "flagged as looking" true at the same instant, whatever the cache says.
  const reconciledRef = React.useRef(false);
  React.useEffect(() => {
    if (!athleteId || !initialRanked || reconciledRef.current) return;
    reconciledRef.current = true;
    void goLive();
  }, [athleteId, initialRanked, goLive]);

  // Leaving the surface takes the athlete offline. A tab navigator keeps a
  // screen mounted when you switch away from it, so unmount alone would almost
  // never fire; blur is the event that actually means "not in the Arena".
  const goOfflineRef = React.useRef(goOffline);
  goOfflineRef.current = goOffline;
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        void goOfflineRef.current();
      };
    }, []),
  );

  // Backgrounding is the case web gets wrong: the socket dies on its own and
  // presence lapses, but the flag survives and keeps advertising an athlete
  // who has closed the app.
  React.useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === "active") return;
      void goOfflineRef.current();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  return { isLive, isSaving, toggle };
}
