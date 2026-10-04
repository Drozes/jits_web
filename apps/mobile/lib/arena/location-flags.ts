/**
 * The two flags the instant go-live migration adds (jr_be 016 addendum 3.1
 * and 5), with the same semantics as `match-location-flag.ts`: read once per
 * foreground into one module value; a failed read counts as OFF and is not
 * remembered as known (the next foreground reads again); a server answer
 * that proves the state flips it at once (`mark`).
 *
 * - `match_proximity_required` (seeded OFF): with `match_location_required`
 *   also on, an Arena (non-invite) start needs both athletes on one mat, so
 *   the accept path takes a reading first. A proximity refusal marks it ON.
 * - `live_location_drift_check` (seeded OFF): the drift check while live.
 *
 * An older backend has neither row: both read OFF.
 */
import * as React from "react";
import { AppState } from "react-native";
import type { Result } from "@jits/shared/api/errors";
import { getLiveLocationDriftCheck, getMatchProximityRequired } from "@jits/shared/api/location";
import { supabase } from "@/lib/supabase/client";

export interface FlagStore {
  /** Read from the server (deduped). Resolves the value now in effect. */
  load: () => Promise<boolean>;
  /** The known value, else one read. */
  read: () => Promise<boolean>;
  /** The value now (false until known), synchronously. */
  peek: () => boolean;
  /** A server answer proved the state. */
  mark: (on: boolean) => void;
  /** Forget (sign-out, tests). */
  reset: () => void;
  /** The value for rendering; reads on mount when unknown and on every foreground. */
  use: () => boolean;
}

export function createFlagStore(name: string, fetch: () => Promise<Result<boolean>>): FlagStore {
  let value = false;
  let known = false;
  let generation = 0;
  let inflight: Promise<boolean> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of [...listeners]) l();
  };
  const publish = (next: boolean) => {
    const changed = next !== value;
    value = next;
    if (changed) emit();
  };
  const load = (): Promise<boolean> => {
    if (!inflight) {
      const gen = generation;
      const p = fetch()
        .then((res) => {
          if (gen !== generation) return value;
          if (res.ok) {
            known = true;
            publish(res.data);
          } else {
            console.warn(`[location] ${name} read failed:`, res.error.message);
            known = false;
            publish(false);
          }
          return value;
        })
        .catch(() => {
          known = false;
          return value;
        })
        .finally(() => {
          if (inflight === p) inflight = null;
        });
      inflight = p;
    }
    return inflight;
  };
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  };
  const peek = () => value;
  return {
    load,
    read: () => (known ? Promise.resolve(value) : load()),
    peek,
    mark: (on) => {
      generation += 1;
      inflight = null;
      known = true;
      publish(on);
    },
    reset: () => {
      generation += 1;
      known = false;
      inflight = null;
      publish(false);
    },
    use: () => {
      React.useEffect(() => {
        if (!known) void load();
        const sub = AppState.addEventListener("change", (s) => {
          if (s === "active") void load();
        });
        return () => sub.remove();
      }, []);
      return React.useSyncExternalStore(subscribe, peek, peek);
    },
  };
}

export const matchProximityFlag = createFlagStore("match_proximity_required", () =>
  getMatchProximityRequired(supabase),
);

export const liveDriftCheckFlag = createFlagStore("live_location_drift_check", () =>
  getLiveLocationDriftCheck(supabase),
);

/** `match_proximity_required` for rendering. */
export function useMatchProximityRequired(): boolean {
  return matchProximityFlag.use();
}

/** `live_location_drift_check` for rendering. */
export function useLiveDriftCheckEnabled(): boolean {
  return liveDriftCheckFlag.use();
}

/** A proximity refusal from the server proves the flag is on. */
export function markMatchProximityRequired(on: boolean): void {
  matchProximityFlag.mark(on);
}

/** Sign-out: forget both. */
export function resetLocationFlags(): void {
  matchProximityFlag.reset();
  liveDriftCheckFlag.reset();
}
