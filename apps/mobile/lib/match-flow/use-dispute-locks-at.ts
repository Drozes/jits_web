import * as React from "react";
import { getMatchResultLockSeconds } from "@jits/shared/api/queries";
import { supabase } from "@/lib/supabase/client";
import { resolveDisputeLocksAt } from "./match-extras";

/**
 * The backend's result lock window, read at most once per app run (it is a
 * constant, jr_be-ahn.5). A failed read is not cached, so a later confirm
 * step can try again.
 */
let cachedLockSeconds: number | null = null;
let inflight: Promise<number | null> | null = null;

function loadLockSeconds(): Promise<number | null> {
  if (cachedLockSeconds != null) return Promise.resolve(cachedLockSeconds);
  if (!inflight) {
    inflight = Promise.resolve()
      .then(() => getMatchResultLockSeconds(supabase))
      .catch(() => null)
      .then((v) => {
        if (v != null) cachedLockSeconds = v;
        inflight = null;
        return v;
      });
  }
  return inflight;
}

/** Test hook: forget the cached lock window. */
export function resetLockSecondsCache() {
  cachedLockSeconds = null;
  inflight = null;
}

/**
 * When the confirm step's result locks. Uses `dispute_locks_at` when the
 * backend sent it; otherwise falls back to `completed_at` +
 * `match_result_lock_seconds()`, calling that RPC only in the fallback case.
 */
export function useDisputeLocksAt(disputeLocksAt: string | null, completedAt: string | null): string | null {
  const needsFallback = !disputeLocksAt && !!completedAt;
  const [lockSeconds, setLockSeconds] = React.useState<number | null>(cachedLockSeconds);
  React.useEffect(() => {
    if (!needsFallback || lockSeconds != null) return;
    let alive = true;
    void loadLockSeconds().then((v) => {
      if (alive && v != null) setLockSeconds(v);
    });
    return () => {
      alive = false;
    };
  }, [needsFallback, lockSeconds]);
  return resolveDisputeLocksAt(disputeLocksAt, completedAt, lockSeconds);
}
