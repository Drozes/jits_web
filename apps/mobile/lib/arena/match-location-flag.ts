/**
 * `match_location_required` (jr_be 016 addendum, contract-location-flag 1
 * and 6): read once per foreground through the shared helper and kept in one
 * module value, so the live owner, the Arena accept, the Booked strip and the
 * invite screens all agree.
 *
 * A failed read counts as OFF (the server is the authority and refuses with
 * HINT `location_required` / `proximity_required` when it is actually on),
 * but is not remembered as known, so the next foreground reads again. A
 * server answer that proves the flag's state flips it here at once, either
 * way (`markMatchLocationRequired`), and the Arena re-reads it on focus.
 */
import * as React from "react";
import { AppState } from "react-native";
import { getMatchLocationRequired } from "@jits/shared/api/location";
import { supabase } from "@/lib/supabase/client";

let value = false;
/** A successful read (or a server signal) confirmed `value`. */
let known = false;
/**
 * Some answer is in hand (a read settled, even a failed one, or a server
 * signal): the UI may render the flag's variant. False from launch (and after
 * sign-out) until then, so nothing flashes the flag-off UI (a Start match
 * button) on a cold start with the flag on.
 */
let resolved = false;
/** Bumped by every server signal, so a read that started earlier never overrides it. */
let generation = 0;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function publish(next: boolean) {
  const changed = next !== value || !resolved;
  value = next;
  resolved = true;
  if (changed) emit();
}

/** Read the flag from the server (deduped). Resolves the value now in effect. */
export function loadMatchLocationRequired(): Promise<boolean> {
  if (!inflight) {
    const gen = generation;
    const p = getMatchLocationRequired(supabase)
      .then((res) => {
        // A server signal landed while this read was in flight: it is newer.
        if (gen !== generation) return value;
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
        if (inflight === p) inflight = null;
      });
    inflight = p;
  }
  return inflight;
}

/** The flag for imperative callers: the known value, else one read. */
export function readMatchLocationRequired(): Promise<boolean> {
  return known ? Promise.resolve(value) : loadMatchLocationRequired();
}

/**
 * A server answer proved the flag's state, whatever we last read: a refusal
 * with HINT `location_required` / `proximity_required` (on), or a reply only
 * a flag-off server gives (`start_blocked_reason: 'start_available'`,
 * `get_arena_nearby` mode `flag_off`). This is how an owner's mid-session
 * flip reaches a running client before its next foreground read.
 */
export function markMatchLocationRequired(on: boolean): void {
  generation += 1;
  inflight = null;
  known = true;
  publish(on);
}

/** Forget the flag (sign-out, tests). */
export function resetMatchLocationRequired(): void {
  generation += 1;
  known = false;
  resolved = false;
  inflight = null;
  value = false;
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getValue(): boolean {
  return value;
}

function getResolved(): boolean {
  return resolved;
}

/**
 * Read on mount when unknown and again on every return to the foreground
 * (the owner may flip it while the app is open).
 */
function useFlagReads(): void {
  React.useEffect(() => {
    if (!known) void loadMatchLocationRequired();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void loadMatchLocationRequired();
    });
    return () => sub.remove();
  }, []);
}

/** The flag for rendering (false until known; see `useMatchLocationFlag`). */
export function useMatchLocationRequired(): boolean {
  useFlagReads();
  return React.useSyncExternalStore(subscribe, getValue, getValue);
}

/**
 * The flag plus whether it is known yet. Surfaces that differ by the flag
 * (Start match vs location) render neither variant until `known`.
 */
export function useMatchLocationFlag(): { required: boolean; known: boolean } {
  useFlagReads();
  const required = React.useSyncExternalStore(subscribe, getValue, getValue);
  const known = React.useSyncExternalStore(subscribe, getResolved, getResolved);
  return { required, known };
}
