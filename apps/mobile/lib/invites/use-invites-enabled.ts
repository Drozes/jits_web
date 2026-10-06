import * as React from "react";
import { AppState } from "react-native";
import { readInvitesEnabled } from "@jits/shared/api/invites";
import { supabase } from "@/lib/supabase/client";

// Only a successful read is cached: a failed one (offline cold start, token
// refresh in flight) must not hide every invite entry point for the run.
let cached: boolean | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(on: boolean) => void>();

function load(): Promise<void> {
  if (cached !== null) return Promise.resolve();
  if (!inflight) {
    inflight = readInvitesEnabled(supabase)
      .then((on) => {
        if (on === null) return;
        cached = on;
        for (const l of listeners) l(on);
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Forget the cached flag (sign-out: the next account reads it fresh). */
export function resetInvitesEnabledCache(): void {
  cached = null;
}

/**
 * The cached flag, or null until a read has succeeded. Subscribes for the
 * screen's lifetime; a failed read is retried on the next mount and on every
 * return to the foreground.
 */
function useInvitesFlagValue(): boolean | null {
  const [value, setValue] = React.useState<boolean | null>(cached);
  React.useEffect(() => {
    const listener = (on: boolean) => setValue(on);
    listeners.add(listener);
    if (cached !== null) setValue(cached);
    else void load();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && cached === null) void load();
    });
    return () => {
      listeners.delete(listener);
      sub.remove();
    };
  }, []);
  return value;
}

/**
 * `invites_enabled` (contract 1). Fail-closed: false until a read succeeds.
 * A failed read is retried on the next mount and on every return to the
 * foreground; every entry point is hidden while false.
 */
export function useInvitesEnabled(): boolean {
  return useInvitesFlagValue() ?? false;
}

export interface InvitesFlagState {
  /** Same value as `useInvitesEnabled()`: false while unknown (fail-closed). */
  enabled: boolean;
  /** False until a read has succeeded: the flag is unknown, not off. */
  known: boolean;
  /** The two fields as one tri-state. */
  state: "on" | "off" | "unknown";
}

/**
 * `invites_enabled` with "not read yet" kept apart from "off", over the same
 * cache as `useInvitesEnabled` (specs/matches-tab 10.2). A surface whose
 * fallback differs by flag (the Matches zero state: Challenge a friend when
 * on, the practice link when off) renders neither while `known` is false, so
 * it never flashes the wrong one.
 */
export function useInvitesFlagState(): InvitesFlagState {
  const value = useInvitesFlagValue();
  if (value === null) return { enabled: false, known: false, state: "unknown" };
  return { enabled: value, known: true, state: value ? "on" : "off" };
}
