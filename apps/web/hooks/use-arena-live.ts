"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { toggleMatchPreferences } from "@jits/shared/api/mutations";
import { joinLobby, leaveLobby } from "@/hooks/use-lobby-presence";
import {
  GO_LIVE_REFRESH_MS,
  captureAndReport,
  hintOf,
  locationPermission,
  type LocationFailure,
} from "@/lib/location/match-location";

/**
 * What the Go Live surface must show while `match_location_required` is on:
 * the explain step before the browser prompt, or why going live stopped.
 */
export type LiveLocationPrompt = "explain" | LocationFailure | null;

/** The flag reader the owner passes in (`useMatchLocationRequired`). */
export interface LiveLocationFlag {
  required: boolean;
  ensure: () => Promise<boolean>;
  markRequired: () => void;
}

const FLAG_OFF: LiveLocationFlag = {
  required: false,
  ensure: () => Promise.resolve(false),
  markRequired: () => {},
};

function syncPresence(athleteId: string, live: boolean) {
  if (live) {
    joinLobby({
      athlete_id: athleteId,
      looking_for_casual: false,
      looking_for_ranked: true,
    });
  } else {
    leaveLobby();
  }
}

/** true = landed, false = failed and rolled back, null = queued behind a write. */
type WriteOutcome = boolean | null;

/**
 * The single writer of the athlete's live flag (`looking_for_ranked`) and of
 * their `lobby:online` track. Mounted only by `<ArenaBootstrap />`; everything
 * else calls `arenaActions` from `lib/arena/arena-store.ts`.
 *
 * - Optimistic, with rollback + toast on a failed write. The rollback also
 *   re-syncs presence, because a socket rejoin during the write tracks from
 *   the optimistic value.
 * - A user toggle during an in-flight write is dropped (double-tap guard).
 *   A system request (match enter/exit) is queued and applied afterwards.
 * - Matches (mirrors mobile use-arena-live): entering an immersive route
 *   takes a live athlete offline, and leaving it restores live if the match
 *   is what took them down. Nobody can answer a prompt mid-roll.
 * - `initialLive` changes (a router.refresh after another device or tab
 *   toggled) re-sync the local flag. Changes that land while a write or our
 *   own refresh is in flight, or during a match, are deferred and reconciled
 *   afterwards; a prop value equal to our last successful write is our own
 *   echo, not an external change. Deferring until our refresh settles is
 *   what stops a stale refresh from a rapid double toggle flipping it back.
 * - `match_location_required` on (contract-location-flag 6): going live
 *   first takes a fresh browser reading and reports it as `go_live` (explain
 *   step before the first prompt, denied and accuracy states after), and
 *   while live the reading is refreshed every 60 s with the tab visible, so
 *   an Arena start always has a fresh one. Off: none of this runs.
 */
export function useArenaLive({
  athleteId,
  initialLive,
  inMatch = false,
  location = FLAG_OFF,
}: {
  athleteId: string;
  initialLive: boolean;
  inMatch?: boolean;
  location?: LiveLocationFlag;
}) {
  const router = useRouter();
  const [isLive, setIsLive] = useState(initialLive);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshPending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const liveRef = useRef(initialLive);
  const queued = useRef<boolean | null>(null);
  const latestInitial = useRef(initialLive);
  latestInitial.current = initialLive;
  const seenInitial = useRef(initialLive);
  const lastWritten = useRef<boolean | null>(null);
  /** Whether entering the current match is what took the athlete offline. */
  const resumeAfterMatch = useRef(false);
  const [locationPrompt, setLocationPrompt] = useState<LiveLocationPrompt>(null);
  const [isLocating, setIsLocating] = useState(false);
  const locationRef = useRef(location);
  locationRef.current = location;
  /** The athlete has seen the explain step; do not show it twice. */
  const explained = useRef(false);
  /** When the last go_live reading was taken (ms epoch), for the refresher. */
  const lastReadingAt = useRef(0);

  /**
   * The location gate in front of a go-live write. `pass` when the flag is
   * off or a fresh reading was reported (or reported without landing: the
   * server then decides); `explain` when the athlete must see the explain
   * step first; `blocked` when the reading failed (prompt set).
   */
  const locationGate = useCallback(
    async (interactive: boolean): Promise<"pass" | "explain" | "blocked"> => {
      if (!(await locationRef.current.ensure())) return "pass";
      if (interactive && !explained.current && (await locationPermission()) !== "granted") {
        setLocationPrompt("explain");
        return "explain";
      }
      explained.current = true;
      setIsLocating(true);
      try {
        const capture = await captureAndReport(createClient(), "go_live");
        if (!capture.ok && capture.failure) {
          setLocationPrompt(capture.failure);
          return "blocked";
        }
        if (capture.ok) lastReadingAt.current = Date.now();
        setLocationPrompt(null);
        return "pass";
      } finally {
        setIsLocating(false);
      }
    },
    [],
  );

  /** A new, external `initialLive` value, or null if there is none. */
  const takeExternal = useCallback((): boolean | null => {
    const v = latestInitial.current;
    if (v === seenInitial.current) return null;
    seenInitial.current = v;
    if (v === lastWritten.current) {
      // An echo is consumed once; a later identical value is a real change
      // (e.g. web live, mobile off, mobile on again).
      lastWritten.current = null;
      return null;
    }
    return v;
  }, []);

  const applyExternal = useCallback(
    (v: boolean) => {
      // The external value supersedes whatever this tab last wrote.
      lastWritten.current = null;
      liveRef.current = v;
      setIsLive(v);
      syncPresence(athleteId, v);
    },
    [athleteId],
  );

  const setLive = useCallback(
    async (
      next: boolean,
      { refresh = true, interactive = true } = {},
    ): Promise<WriteOutcome> => {
      if (inFlight.current) {
        queued.current = next;
        return null;
      }
      if (liveRef.current === next) return true;
      inFlight.current = true;
      setIsSaving(true);
      if (!next) setLocationPrompt(null);

      const gate = next ? await locationGate(interactive) : "pass";
      let ok = false;
      if (gate === "pass") {
        liveRef.current = next;
        setIsLive(next);
        let hint: string | null = null;
        try {
          // Ranked-only product: casual is always cleared. get_arena_data
          // filters on (casual OR ranked), so ranked alone lists the athlete.
          const result = await toggleMatchPreferences(createClient(), athleteId, {
            lookingForCasual: false,
            lookingForRanked: next,
          });
          ok = result.ok;
          if (!result.ok) hint = hintOf(result.error);
        } catch {
          ok = false;
        }

        if (ok) {
          lastWritten.current = next;
          syncPresence(athleteId, next);
          // Re-read server data so the Arena roster reflects the change.
          if (refresh) startTransition(() => router.refresh());
        } else {
          liveRef.current = !next;
          setIsLive(!next);
          // A go-live that never landed must not be "restored" after a match.
          if (next) resumeAfterMatch.current = false;
          syncPresence(athleteId, !next);
          if (hint === "location_required") {
            // The server has the flag on even if our read said off.
            locationRef.current.markRequired();
            setLocationPrompt("denied");
          } else {
            toast.error("Couldn't update your status. Try again.");
          }
        }
      } else if (next) {
        resumeAfterMatch.current = false;
      }
      inFlight.current = false;
      setIsSaving(false);

      const pending = queued.current;
      queued.current = null;
      if (pending !== null && pending !== liveRef.current) {
        return setLive(pending, { refresh: false, interactive });
      }
      if (gate === "explain") return null;
      return gate === "pass" ? ok : false;
    },
    [athleteId, router, locationGate],
  );

  const toggle = useCallback(async () => {
    if (inFlight.current) return;
    await setLive(!liveRef.current);
  }, [setLive]);
  const goLive = useCallback(async () => {
    await setLive(true);
  }, [setLive]);
  const goOffline = useCallback(async () => {
    await setLive(false);
  }, [setLive]);
  /** Explain step "Allow location", or Retry after a denied/accuracy stop. */
  const confirmLocation = useCallback(async () => {
    explained.current = true;
    await setLive(true);
  }, [setLive]);
  const dismissLocation = useCallback(() => {
    if (!inFlight.current) setLocationPrompt(null);
  }, []);

  // Offline for the length of a match, back afterwards.
  const wasInMatch = useRef(false);
  useEffect(() => {
    if (inMatch === wasInMatch.current) return;
    wasInMatch.current = inMatch;
    if (inMatch) {
      resumeAfterMatch.current = liveRef.current || queued.current === true;
      if (resumeAfterMatch.current) void setLive(false, { refresh: false });
      return;
    }
    // A change made elsewhere during the match wins over the auto-restore.
    const external = takeExternal();
    if (external !== null) {
      resumeAfterMatch.current = false;
      if (external !== liveRef.current) applyExternal(external);
      return;
    }
    if (!resumeAfterMatch.current) return;
    resumeAfterMatch.current = false;
    // Not interactive: no explain step on the way out of a match.
    void setLive(true, { interactive: false }).then((outcome) => {
      if (outcome === false) {
        toast.error("You're offline. Go live again in the Arena.");
      }
    });
  }, [inMatch, setLive, takeExternal, applyExternal]);

  // Another device or tab changed the flag and a refresh brought it in.
  useEffect(() => {
    if (inFlight.current || refreshPending || inMatch) return;
    const external = takeExternal();
    if (external !== null && external !== liveRef.current) {
      applyExternal(external);
    }
  }, [initialLive, refreshPending, inMatch, isSaving, takeExternal, applyExternal]);

  // While live with the flag on: refresh the go_live reading every 60 s with
  // the tab visible (and at once if the last one is older), never in a match.
  const refreshing = useRef(false);
  const required = location.required;
  useEffect(() => {
    if (!isLive || !required || inMatch) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const capture = async () => {
      if (refreshing.current) return;
      refreshing.current = true;
      try {
        // Never surprise the athlete with a browser prompt in the background.
        const perm = await locationPermission();
        if (perm === "denied" || perm === "prompt") return;
        const result = await captureAndReport(createClient(), "go_live");
        if (result.ok) lastReadingAt.current = Date.now();
      } finally {
        refreshing.current = false;
      }
    };
    const start = () => {
      if (timer) return;
      if (Date.now() - lastReadingAt.current >= GO_LIVE_REFRESH_MS) void capture();
      timer = setInterval(() => void capture(), GO_LIVE_REFRESH_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isLive, required, inMatch]);

  return {
    isLive,
    isSaving,
    isLocating,
    locationPrompt,
    toggle,
    goLive,
    goOffline,
    confirmLocation,
    dismissLocation,
  };
}
