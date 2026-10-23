import * as React from "react";
import { AppState } from "react-native";
import { getFeatureFlag } from "@jits/shared/api/location";
import { supabase } from "@/lib/supabase/client";

/**
 * `timekeeper_role` for the Arena's copy only (timekeeper mode spec 4.2
 * Arena, 14.8 M6; TK-AR1 and TK-AR2). The flag NEVER decides a match's mode:
 * the server snapshots it on the match row when the match is created, and
 * the wizard reads that (`match-roles.ts`). Here it only chooses which helper
 * line the Arena shows before a match exists, so a wrong value costs a
 * sentence, never a flow.
 *
 * Fail-closed and tri-state, like `lib/invites/use-invites-enabled.ts`: the
 * shipped copy shows until a read has succeeded. Unlike invites, the Arena
 * copy follows the live flag (spec 11, "Flag flipped while the opponent looks
 * at the challenge sheet"), so a known value is read again on every mount and
 * every return to the foreground; the last good value stays on screen while
 * a re-read runs or after one fails.
 */
export const TIMEKEEPER_ROLE_FLAG = "timekeeper_role";

let cached: boolean | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(on: boolean) => void>();

function load(): Promise<void> {
  if (!inflight) {
    // A copy line must never break the screen it sits on: any failure, even
    // a synchronous one, leaves the value as it was.
    inflight = Promise.resolve()
      .then(() => getFeatureFlag(supabase, TIMEKEEPER_ROLE_FLAG))
      .then((res) => {
        if (!res.ok) return;
        cached = res.data;
        for (const l of listeners) l(res.data);
      })
      .catch(() => undefined)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Test-only: forget the cached flag between suites. */
export function __resetTimekeeperEnabledForTests(): void {
  cached = null;
  inflight = null;
  listeners.clear();
}

export interface TimekeeperFlagState {
  /** Known ON. False while unknown (fail-closed) and when off. */
  enabled: boolean;
  /** False until a read has succeeded: the flag is unknown, not off. */
  known: boolean;
}

/**
 * The flag for the Arena copy. Subscribes for the caller's lifetime; reads on
 * mount and on every return to the foreground.
 */
export function useTimekeeperEnabled(): TimekeeperFlagState {
  const [value, setValue] = React.useState<boolean | null>(cached);
  React.useEffect(() => {
    const listener = (on: boolean) => setValue(on);
    listeners.add(listener);
    if (cached !== null) setValue(cached);
    void load();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void load();
    });
    return () => {
      listeners.delete(listener);
      sub.remove();
    };
  }, []);
  return { enabled: value === true, known: value !== null };
}
