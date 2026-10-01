/**
 * Go Live with `match_location_required` ON (contract-location-flag 6): explain,
 * ask for foreground location, take a fresh reading, report it as `go_live`,
 * and only then flip live. The server refuses a go-live without a fresh
 * reading (HINT `location_required`), so this runs BEFORE the live write.
 *
 * The athlete-facing states (explain, denied, poor accuracy, no fix) are a
 * small store read by `<GoLiveLocationSheet />`, which `<ArenaBootstrap />`
 * mounts once beside the challenge prompt. Each one waits on the athlete's
 * answer, outside the live hook's serialized queue, so a background landing
 * while the sheet is up still takes the athlete offline at once.
 *
 * While live (foreground, not in a match) the reading is refreshed every
 * 60 s (`useGoLiveReadingRefresh`), so an Arena start finds a fresh one.
 * Coordinates are sent once per reading and never stored on the device.
 */
import * as React from "react";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { reportGoLivePresence } from "@jits/shared/api/location";
import { supabase } from "@/lib/supabase/client";
import { readLocationOnce } from "@/lib/invites/location";
import type { LiveSwitchIgnored } from "./arena-store";

/** How often a live athlete's `go_live` reading is refreshed (contract 6). */
export const GO_LIVE_REFRESH_MS = 60_000;

export type GoLiveLocationPhase = "explain" | "denied" | "accuracy" | "unavailable";
export type GoLiveLocationChoice = "continue" | "retry" | "cancel";

export interface GoLiveLocationSheetState {
  phase: GoLiveLocationPhase;
  /** A reading is being taken after Continue / Retry. */
  busy: boolean;
}

// ---------------------------------------------------------------------------
// Sheet store
// ---------------------------------------------------------------------------

let sheet: GoLiveLocationSheetState | null = null;
let resolver: ((choice: GoLiveLocationChoice) => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setSheet(next: GoLiveLocationSheetState | null) {
  sheet = next;
  emit();
}

/** Show a phase and wait for the athlete's answer. */
function present(phase: GoLiveLocationPhase): Promise<GoLiveLocationChoice> {
  // A previous wait still open (should not happen: callers are serialized
  // by the live switch guard) is answered "cancel" rather than leaked.
  resolver?.("cancel");
  setSheet({ phase, busy: false });
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

function closeSheet() {
  resolver = null;
  if (sheet) setSheet(null);
}

/** The sheet's buttons. Continue / Retry keep it up (busy) while reading. */
export function answerGoLiveLocation(choice: GoLiveLocationChoice): void {
  const resolve = resolver;
  resolver = null;
  if (choice === "cancel") closeSheet();
  else if (sheet) setSheet({ ...sheet, busy: true });
  resolve?.(choice);
}

export function useGoLiveLocationSheet(): GoLiveLocationSheetState | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => sheet,
    () => sheet,
  );
}

/** Tests only. */
export function __resetGoLiveLocationForTests(): void {
  resolver = null;
  sheet = null;
  emit();
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type ReadOutcome = "ok" | "denied" | "accuracy" | "unavailable" | "error";

/** One reading, reported as `go_live`. `ask`: the system prompt may show. */
async function readAndReport(ask: boolean): Promise<ReadOutcome> {
  const loc = await readLocationOnce({ ask });
  if (loc.status === "denied") return "denied";
  if (loc.status === "unavailable") return "unavailable";
  const res = await reportGoLivePresence(supabase, loc.reading);
  if (!res.ok) {
    console.warn("[location] go_live report failed:", res.error.hint, res.error.message);
    return "error";
  }
  if (!res.data.ok) return res.data.code === "accuracy_too_low" ? "accuracy" : "error";
  return "ok";
}

async function permissionGranted(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    return { granted: Boolean(p.granted), canAskAgain: Boolean(p.canAskAgain) };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

/**
 * `ready`: a fresh `go_live` reading is on the server. `declined`: the
 * athlete closed a location state (the sheet said why; stay silent).
 * `failed`: the report itself failed (network); say "couldn't go live".
 */
export type GoLiveLocationOutcome = "ready" | "declined" | "failed";

const MAX_RETRIES = 5;

/**
 * Make sure a fresh `go_live` reading is on the server before going live.
 * `interactive: false` (a restore the athlete did not tap: foreground, after
 * a match, the 60 s refresh) never asks and never shows anything.
 */
export async function ensureGoLiveLocation(opts: { interactive: boolean }): Promise<GoLiveLocationOutcome> {
  if (!opts.interactive) {
    const r = await readAndReport(false);
    return r === "ok" ? "ready" : r === "error" ? "failed" : "declined";
  }
  const perm = await permissionGranted();
  if (!perm.granted) {
    if (!perm.canAskAgain) {
      await present("denied");
      closeSheet();
      return "declined";
    }
    // Explain first, then the system prompt (asked by the reading below).
    if ((await present("explain")) !== "continue") return "declined";
  }
  for (let i = 0; i < MAX_RETRIES; i++) {
    const r = await readAndReport(true);
    if (r === "ok") {
      closeSheet();
      return "ready";
    }
    if (r === "error") {
      closeSheet();
      return "failed";
    }
    if (r === "denied") {
      await present("denied");
      closeSheet();
      return "declined";
    }
    if ((await present(r)) !== "retry") return "declined";
  }
  closeSheet();
  return "declined";
}

/**
 * The whole flag-ON go-live: the location step, then `goLive()`. A live
 * write the server still refuses with `location_required` (the reading went
 * stale, or was scrubbed) shows the denied / no-fix state with Retry.
 * Resolves like `arenaActions.goLive`: true live, false failed (say so),
 * "ignored" when the athlete closed a location state (already explained).
 */
export async function goLiveWithLocation(
  goLive: () => Promise<boolean>,
  lastRefusal: () => string | null,
): Promise<boolean | LiveSwitchIgnored> {
  for (let i = 0; i < 3; i++) {
    const ready = await ensureGoLiveLocation({ interactive: true });
    if (ready === "declined") return "ignored";
    if (ready === "failed") return false;
    // Backgrounded while the sheet or the reading was up: never advertise an
    // athlete whose app is closed.
    if (AppState.currentState !== "active") return "ignored";
    const ok = await goLive();
    if (ok) return true;
    if (lastRefusal() !== "location_required") return false;
    const perm = await permissionGranted();
    const choice = await present(perm.granted ? "unavailable" : "denied");
    if (choice !== "retry") {
      closeSheet();
      return "ignored";
    }
  }
  closeSheet();
  return false;
}

/**
 * Refresh the `go_live` reading every 60 s while `active` (live, flag on,
 * not in a match) and the app is in the foreground. Silent: never asks.
 */
export function useGoLiveReadingRefresh(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (AppState.currentState !== "active") return;
      void ensureGoLiveLocation({ interactive: false });
    }, GO_LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [active]);
}
