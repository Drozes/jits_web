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
 * `invites_enabled` (contract 1). Fail-closed: false until a read succeeds.
 * A failed read is retried on the next mount and on every return to the
 * foreground; every entry point is hidden while false.
 */
export function useInvitesEnabled(): boolean {
  const [enabled, setEnabled] = React.useState<boolean>(cached ?? false);
  React.useEffect(() => {
    listeners.add(setEnabled);
    if (cached !== null) setEnabled(cached);
    else void load();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && cached === null) void load();
    });
    return () => {
      listeners.delete(setEnabled);
      sub.remove();
    };
  }, []);
  return enabled;
}
