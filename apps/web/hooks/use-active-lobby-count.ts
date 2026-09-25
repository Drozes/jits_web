"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ATHLETE_STATUS } from "@jits/shared/constants";
import { countActiveOthers } from "@/lib/arena/arena-store";

/** Presence syncs arrive in bursts; resolve once they settle. */
export const LOBBY_RESOLVE_DEBOUNCE_MS = 300;
/** How long a resolved id is trusted before it is looked up again. */
export const LOBBY_RESOLVE_TTL_MS = 3 * 60_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Entry {
  active: boolean;
  at: number;
}

/**
 * How many OTHER real, active athletes are in `lobby:online` right now.
 *
 * Presence keys are client-supplied, so the channel can carry ids that are
 * not athletes (stale or foreign clients). Non-UUID keys are dropped outright;
 * the rest are resolved against `athletes` (status = active) and cached for
 * LOBBY_RESOLVE_TTL_MS, so an athlete who is deactivated or activated is
 * picked up within a few minutes. Unresolved ids never count. Derived solely
 * from presence: the DB `looking_for_ranked` flag and get_arena_data are not
 * used.
 *
 * A request is never cancelled by a later presence sync (constant churn
 * would starve it); a sequence number drops a response only if a newer one
 * has already landed.
 *
 * Raw `.from()` read, same as the challenger-name lookup in
 * use-arena-challenge.ts; there is no shared wrapper for an id-set lookup.
 */
export function useActiveLobbyCount(
  presenceIds: Set<string>,
  selfId: string,
): number {
  const cache = useRef(new Map<string, Entry>());
  const issued = useRef(0);
  const applied = useRef(0);
  const [activeIds, setActiveIds] = useState<ReadonlySet<string>>(new Set());
  // A quiet lobby sends no syncs; re-check expiry every half TTL even then,
  // so an entry is never trusted for more than 1.5x the TTL.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), LOBBY_RESOLVE_TTL_MS / 2);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const now = Date.now();
    const stale = [...presenceIds].filter((id) => {
      if (id === selfId || !UUID_RE.test(id)) return false;
      const hit = cache.current.get(id);
      return !hit || now - hit.at > LOBBY_RESOLVE_TTL_MS;
    });
    if (stale.length === 0) return;

    // Only the debounce is cancelled by a newer sync, never the request.
    const timer = setTimeout(async () => {
      const seq = ++issued.current;
      const { data, error } = await createClient()
        .from("athletes")
        .select("id")
        .in("id", stale)
        .eq("status", ATHLETE_STATUS.ACTIVE);
      // On error nothing is cached, so the next presence change retries.
      if (error || seq < applied.current) return;
      applied.current = seq;
      const at = Date.now();
      const found = new Set((data ?? []).map((r: { id: string }) => r.id));
      for (const id of stale) cache.current.set(id, { active: found.has(id), at });
      setActiveIds(
        new Set(
          [...cache.current].filter(([, e]) => e.active).map(([id]) => id),
        ),
      );
    }, LOBBY_RESOLVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [presenceIds, selfId, tick]);

  return countActiveOthers(presenceIds, selfId, activeIds);
}
