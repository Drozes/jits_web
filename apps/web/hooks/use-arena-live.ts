"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { toggleMatchPreferences } from "@jits/shared/api/mutations";
import { joinLobby, leaveLobby } from "@/hooks/use-lobby-presence";

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
 */
export function useArenaLive({
  athleteId,
  initialLive,
  inMatch = false,
}: {
  athleteId: string;
  initialLive: boolean;
  inMatch?: boolean;
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
    async (next: boolean, { refresh = true } = {}): Promise<WriteOutcome> => {
      if (inFlight.current) {
        queued.current = next;
        return null;
      }
      if (liveRef.current === next) return true;
      inFlight.current = true;
      setIsSaving(true);
      liveRef.current = next;
      setIsLive(next);

      let ok = false;
      try {
        // Ranked-only product: casual is always cleared. get_arena_data
        // filters on (casual OR ranked), so ranked alone lists the athlete.
        const result = await toggleMatchPreferences(createClient(), athleteId, {
          lookingForCasual: false,
          lookingForRanked: next,
        });
        ok = result.ok;
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
        toast.error("Couldn't update your status. Try again.");
      }
      inFlight.current = false;
      setIsSaving(false);

      const pending = queued.current;
      queued.current = null;
      if (pending !== null && pending !== liveRef.current) {
        return setLive(pending, { refresh: false });
      }
      return ok;
    },
    [athleteId, router],
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
    void setLive(true).then((outcome) => {
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

  return { isLive, isSaving, toggle, goLive, goOffline };
}
