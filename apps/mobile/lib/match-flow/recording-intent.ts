import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { setMatchRecordingIntent } from "@jits/shared/api/match-video-upload";
import { getRecordingOptIn, hydrateRecordingOptIn } from "./recording-optin";

/**
 * "Record from my phone", persisted to the server (jits-n2im.14).
 *
 * The face-off toggle itself stays device-local (`recording-optin.ts`) and is
 * still broadcast to the opponent; this ALSO records it in
 * `match_recording_intents` via `set_match_recording_intent`, so the server
 * knows how many angles to expect (jr_be-1qz.4, the match-level grace gate)
 * even if no byte ever arrives.
 *
 * Fire and forget, and it never blocks ready: every change is queued per
 * match and the queue always sends the LATEST wanted value, so a quick
 * ON -> OFF cannot land out of order. A failure is retried once after
 * RECORDING_INTENT_RETRY_MS; the next change, or readying up, tries again.
 * `intent_frozen` (the match is over) and `not_participant` are final.
 */
export const RECORDING_INTENT_RETRY_MS = 2_000;

const FINAL_HINTS = new Set(["intent_frozen", "not_participant"]);

const wanted = new Map<string, boolean>();
const confirmed = new Map<string, boolean>();
const chains = new Map<string, Promise<void>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flush(matchId: string): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const value = wanted.get(matchId);
    if (value === undefined || confirmed.get(matchId) === value) return;
    let hint: string | null = null;
    try {
      const res = await setMatchRecordingIntent(supabase, matchId, value);
      if (res.ok) {
        confirmed.set(matchId, value);
        // Loop: if the toggle moved while this was in flight, send that too.
        continue;
      }
      hint = res.error.raw?.hint ?? null;
      console.warn(`[match-flow] recording intent for ${matchId} not saved: ${res.error.message}`);
    } catch (err) {
      console.warn(`[match-flow] recording intent for ${matchId} not saved:`, err);
    }
    if (hint && FINAL_HINTS.has(hint)) return;
    if (attempt === 1) await sleep(RECORDING_INTENT_RETRY_MS);
  }
}

/** Queue the athlete's intent for this match. Resolves when the queue drains; never rejects. */
export function persistRecordingIntent(matchId: string, intends: boolean): Promise<void> {
  wanted.set(matchId, intends);
  const next = (chains.get(matchId) ?? Promise.resolve()).then(() => flush(matchId));
  chains.set(matchId, next);
  void next.then(() => {
    if (chains.get(matchId) === next) chains.delete(matchId);
  });
  return next;
}

/**
 * Persist the face-off toggle while the face-off is active: on entering it
 * (the remembered value counts as a declaration), on every change, and again
 * on ready (the toggle locks then), which is a no-op unless an earlier send
 * failed. Waits for the remembered choice to load first, so the stale
 * pre-hydration OFF is never sent.
 */
export function useRecordingIntent(matchId: string, recording: boolean, active: boolean, ready: boolean): void {
  React.useEffect(() => {
    if (!active || !matchId) return;
    let cancelled = false;
    void hydrateRecordingOptIn().then(() => {
      if (!cancelled) void persistRecordingIntent(matchId, getRecordingOptIn());
    });
    return () => {
      cancelled = true;
    };
  }, [matchId, recording, active, ready]);
}

/** Tests only. */
export function __resetRecordingIntentForTests(): void {
  wanted.clear();
  confirmed.clear();
  chains.clear();
}
