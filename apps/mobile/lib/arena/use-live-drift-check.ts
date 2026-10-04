/**
 * The drift check (jr_be 016 addendum, instant go-live 4.4; UX 019, 3k),
 * behind the flag `live_location_drift_check` (seeded OFF).
 *
 * Active only when the flag is on, `match_location_required` is on, the
 * athlete is live, not in a match, the app is in the foreground, location
 * permission is ALREADY granted (it never prompts), and the device store
 * holds a `go_live` tag to compare with. Every `DRIFT_INTERVAL_MS` (5 min)
 * one silent reading; drifted when
 * `haversine(tag, reading) - LEAST(tag.acc + reading.acc, 100) > 500 m`.
 * The comparison runs on the device (no new RPC, nothing extra sent).
 *
 * Drifted: the non-blocking "Still on the same mat?" sheet
 * (`components/arena/drift-prompt-sheet.tsx`), once per drift streak: after
 * it closes, no further prompt until a later check is not drifted or the
 * tag changes. Update re-tags (the reading is reported as `go_live` and
 * kept on the device); Go offline is the manual go-offline. The athlete
 * stays live while the sheet is up. A prompt waiting while the app goes to
 * the background is dropped, not queued.
 *
 * Logged: `drift_check` / `drifted` when the prompt is shown, and the
 * answer as `drift_prompt` / `retagged` | `went_offline` | `dismissed`
 * (not-drifted checks are not logged, D10).
 */
import * as React from "react";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { DRIFT_INTERVAL_MS, isDrifted } from "@jits/shared/constants/go-live";
import { reportGoLivePresence } from "@jits/shared/api/location";
import type { LocationReading } from "@jits/shared/api/invites";
import { supabase } from "@/lib/supabase/client";
import { readLocationOnce } from "@/lib/invites/location";
import { peekDeviceLocation, recordAcceptedReading } from "@/lib/location/device-location-store";
import { notePresenceAnswer } from "@/lib/location/presence-capability";
import { isInArenaMatch } from "./arena-store";
import { goOfflineWithFeedback } from "./go-live-feedback";
import { permissionState } from "./go-live-location";
import { useLiveDriftCheckEnabled } from "./location-flags";
import { logDriftCheck, logDriftPrompt } from "./location-telemetry";

export interface DriftPrompt {
  reading: LocationReading;
  capturedAt: number;
  /** Update is reporting the reading. */
  busy: boolean;
}

let prompt: DriftPrompt | null = null;
const listeners = new Set<() => void>();
/** This streak already prompted, for the tag captured at this time. */
let promptedTagAt: number | null = null;

function emit(): void {
  for (const l of [...listeners]) l();
}

function setPrompt(next: DriftPrompt | null): void {
  prompt = next;
  emit();
}

export function useDriftPrompt(): DriftPrompt | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => prompt,
    () => prompt,
  );
}

/** Drop a prompt that has not been answered (background, offline, a match). Not logged. */
export function dropDriftPrompt(): void {
  if (prompt) setPrompt(null);
}

/**
 * The athlete's answer. `update`: report the reading as the new tag (the
 * sheet stays up, busy, until it settles; a failure closes it silently).
 * `offline`: the manual go-offline. `dismiss`: closed without a choice.
 */
export async function answerDriftPrompt(choice: "update" | "offline" | "dismiss"): Promise<void> {
  const current = prompt;
  if (!current || current.busy) return;
  if (choice === "dismiss") {
    setPrompt(null);
    logDriftPrompt("dismissed");
    return;
  }
  if (choice === "offline") {
    setPrompt(null);
    logDriftPrompt("went_offline");
    await goOfflineWithFeedback();
    return;
  }
  setPrompt({ ...current, busy: true });
  logDriftPrompt("retagged");
  try {
    const res = await reportGoLivePresence(supabase, current.reading, { capturedAt: current.capturedAt });
    if (res.ok) {
      notePresenceAnswer(res.data);
      recordAcceptedReading("go_live", current.reading, current.capturedAt, res.data);
      // The tag changed: a later drift from it is a new streak.
      if (res.data.ok) promptedTagAt = null;
    }
  } catch {
    // Silent: the next check prompts again if still drifted.
  } finally {
    if (prompt === null || prompt.busy) setPrompt(null);
  }
}

export interface LiveDriftCheckInput {
  athleteId: string;
  isLive: boolean;
  inMatch: boolean;
  locationRequired: boolean;
}

/** One check; resolves whether it prompted. Exported for tests. */
export async function runDriftCheck(athleteId: string): Promise<boolean> {
  if (AppState.currentState !== "active" || isInArenaMatch() || prompt) return false;
  const perm = await permissionState();
  if (!perm.granted) return false;
  const tag = peekDeviceLocation(athleteId);
  if (!tag || tag.context !== "go_live") return false;
  const loc = await readLocationOnce({ ask: false, fast: true, skipLastKnown: true });
  if (loc.status !== "ok" || loc.reducedPrecision) return false;
  if (AppState.currentState !== "active" || isInArenaMatch()) return false;
  if (!isDrifted(tag, loc.reading)) {
    // The streak ended: the next drift may prompt again.
    promptedTagAt = null;
    return false;
  }
  if (promptedTagAt === tag.capturedAt) return false;
  promptedTagAt = tag.capturedAt;
  logDriftCheck(loc.reading);
  setPrompt({ reading: loc.reading, capturedAt: loc.capturedAt ?? Date.now(), busy: false });
  return true;
}

/** Mounted once by `<ArenaBootstrap />`. With the flag off it does nothing at all. */
export function useLiveDriftCheck({ athleteId, isLive, inMatch, locationRequired }: LiveDriftCheckInput): void {
  const enabled = useLiveDriftCheckEnabled();
  const active = enabled && locationRequired && isLive && !inMatch;
  React.useEffect(() => {
    if (!active) {
      dropDriftPrompt();
      promptedTagAt = null;
      return;
    }
    let inflight = false;
    const t = setInterval(() => {
      if (inflight) return;
      inflight = true;
      void runDriftCheck(athleteId)
        .catch(() => false)
        .finally(() => {
          inflight = false;
        });
    }, DRIFT_INTERVAL_MS);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") dropDriftPrompt();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [active, athleteId]);
}

/** Tests only. */
export function __resetLiveDriftCheckForTests(): void {
  prompt = null;
  promptedTagAt = null;
  listeners.clear();
}
