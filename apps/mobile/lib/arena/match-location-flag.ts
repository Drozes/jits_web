/**
 * `match_location_required` (jr_be 016 addendum, contract-location-flag 1
 * and 6): read once per foreground through the shared helper and kept in one
 * module value, so the live owner, the Arena accept, the Booked strip and the
 * invite screens all agree.
 *
 * A failed read counts as OFF (the server is the authority and refuses with
 * HINT `location_required` / `proximity_required` when it is actually on),
 * but is not remembered as known, so the next foreground reads again. A
 * server refusal that proves the flag is on flips it here at once
 * (`markMatchLocationRequired`).
 */
import * as React from "react";
import { AppState } from "react-native";
import { getMatchLocationRequired } from "@jits/shared/api/location";
import { supabase } from "@/lib/supabase/client";

let value = false;
let known = false;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<(on: boolean) => void>();

function publish(next: boolean) {
  if (next === value) return;
  value = next;
  for (const l of listeners) l(next);
}

/** Read the flag from the server (deduped). Resolves the value now in effect. */
export function loadMatchLocationRequired(): Promise<boolean> {
  if (!inflight) {
    inflight = getMatchLocationRequired(supabase)
      .then((res) => {
        if (res.ok) {
          known = true;
          publish(res.data);
        } else {
          console.warn("[location] match_location_required read failed:", res.error.message);
          known = false;
          publish(false);
        }
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The flag for imperative callers: the known value, else one read. */
export function readMatchLocationRequired(): Promise<boolean> {
  return known ? Promise.resolve(value) : loadMatchLocationRequired();
}

/** The server refused with a location HINT: the flag is on, whatever we read. */
export function markMatchLocationRequired(on: boolean): void {
  known = true;
  publish(on);
}

/** Forget the flag (sign-out, tests). */
export function resetMatchLocationRequired(): void {
  known = false;
  inflight = null;
  value = false;
  for (const l of listeners) l(false);
}

/**
 * The flag for rendering. Read on mount when unknown and again on every
 * return to the foreground (the owner may flip it while the app is open).
 */
export function useMatchLocationRequired(): boolean {
  const [on, setOn] = React.useState(value);
  React.useEffect(() => {
    listeners.add(setOn);
    setOn(value);
    if (!known) void loadMatchLocationRequired();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void loadMatchLocationRequired();
    });
    return () => {
      listeners.delete(setOn);
      sub.remove();
    };
  }, []);
  return on;
}
