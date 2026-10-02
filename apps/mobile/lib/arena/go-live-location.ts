/**
 * Go Live with `match_location_required` ON (contract-location-flag 6): explain,
 * ask for foreground location, take a fresh reading, report it as `go_live`,
 * and only then flip live. The server refuses a go-live without a fresh
 * reading (HINT `location_required`), so this runs BEFORE the live write.
 *
 * The athlete-facing states (explain, denied, poor accuracy, Precise Location
 * off, no fix) are a small store read by `<GoLiveLocationSheet />`, which
 * `<ArenaBootstrap />` mounts once beside the challenge prompt. Each one
 * waits on the athlete's answer, outside the live hook's serialized queue,
 * so a background landing while the sheet is up still takes the athlete
 * offline at once.
 *
 * Live location fixes (jr_be 016 addendum, section 4):
 *  - 1a: permission that is not granted but can still be asked (never asked,
 *    or an iOS "Allow Once" grant that lapsed, which iOS reports as
 *    `undetermined` with `canAskAgain`) gets the explain sheet and the
 *    system prompt, never the denied sheet. The denied sheet is only for
 *    `canAskAgain` false, and its Retry re-reads the permission.
 *  - 1e: going to the background mid-flow cancels it and closes the sheet
 *    (logged `dismissed`); the system prompt is bounded at 30 s.
 *  - 3a: a reduced-precision reading gets the Precise Location copy.
 *  - 5: one `go_live_attempt` log per athlete-initiated flow, fire and forget.
 *
 * While live (foreground, not in a match) the reading is refreshed every
 * 60 s (`useGoLiveReadingRefresh`), so an Arena start finds a fresh one.
 * Coordinates are sent once per reading and never stored on the device.
 */
import * as React from "react";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { reportGoLivePresence, type LocationEventOutcome } from "@jits/shared/api/location";
import type { LocationReading } from "@jits/shared/api/invites";
import { supabase } from "@/lib/supabase/client";
import { readLocationOnce } from "@/lib/invites/location";
import type { LiveSwitchIgnored } from "./arena-store";
import { logGoLiveAttempt } from "./location-telemetry";

/** How often a live athlete's `go_live` reading is refreshed (contract 6). */
export const GO_LIVE_REFRESH_MS = 60_000;

export type GoLiveLocationPhase = "explain" | "denied" | "accuracy" | "precise" | "unavailable" | "movement";
/**
 * The sheet's answers. `background`: the app went to the background mid-flow
 * (never a button); the flow ends as `dismissed`.
 */
export type GoLiveLocationChoice = "continue" | "retry" | "cancel" | "background";

export interface GoLiveLocationSheetState {
  phase: GoLiveLocationPhase;
  /** A reading is being taken after Continue / Retry. */
  busy: boolean;
  /**
   * Why location is asked: `go_live` (default) or `arena`, the challenger's
   * waiting state asking once so its challenge can start (same copy, a
   * title that does not say "go live").
   */
  purpose?: "go_live" | "arena";
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
function present(
  phase: GoLiveLocationPhase,
  purpose: "go_live" | "arena" = "go_live",
): Promise<GoLiveLocationChoice> {
  // A previous wait still open (should not happen: callers are serialized
  // by the live switch guard) is answered "cancel" rather than leaked.
  resolver?.("cancel");
  setSheet({ phase, busy: false, purpose });
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

function closeSheet() {
  resolver = null;
  if (sheet) setSheet(null);
}

/** The sheet's buttons. Continue / Retry keep it up (busy) while reading. */
export function answerGoLiveLocation(choice: Exclude<GoLiveLocationChoice, "background">): void {
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
  if (activeFlow) endFlow(activeFlow);
  emit();
}

/**
 * The challenger's one-time ask (flag on, permission not granted, waiting on
 * an outgoing challenge): the same explain copy, then the system prompt.
 * Resolves true on Continue, with the sheet left up (busy) until
 * `closeLocationSheet()`; false when the athlete chose Not now.
 */
export async function explainArenaLocation(): Promise<boolean> {
  return (await present("explain", "arena")) === "continue";
}

export function closeLocationSheet(): void {
  closeSheet();
}

/**
 * Drop whatever location state is up, answering its wait (`cancel` by
 * default) so the flow behind it (a Go Live holding the live switch)
 * unwinds instead of waiting forever. `purpose`: only a sheet shown for that
 * purpose. Called when its owner goes away: ArenaOwner unmount, sign-out,
 * the challenger's waiting state ending, and the app going to the background
 * mid Go Live (`background`).
 */
export function cancelLocationSheet(
  purpose?: "go_live" | "arena",
  choice: "cancel" | "background" = "cancel",
): void {
  if (purpose && (sheet?.purpose ?? "go_live") !== purpose) return;
  const resolve = resolver;
  resolver = null;
  if (sheet) setSheet(null);
  resolve?.(choice);
}

// ---------------------------------------------------------------------------
// Flow lifetime (1e): backgrounding cancels a Go Live in progress
// ---------------------------------------------------------------------------

/** One athlete-initiated Go Live flow. `aborted` once the app went to the background. */
export interface GoLiveFlow {
  aborted: boolean;
}

let activeFlow: GoLiveFlow | null = null;
let appStateSub: { remove: () => void } | null = null;

function beginFlow(): GoLiveFlow {
  const flow: GoLiveFlow = { aborted: false };
  activeFlow = flow;
  if (!appStateSub) {
    appStateSub = AppState.addEventListener("change", (next) => {
      // "inactive" is the system prompt itself, the notification shade or
      // the app switcher: only a real background ends the flow.
      if (next !== "background" || !activeFlow) return;
      activeFlow.aborted = true;
      cancelLocationSheet("go_live", "background");
    });
  }
  return flow;
}

function endFlow(flow: GoLiveFlow): void {
  if (activeFlow !== flow) return;
  activeFlow = null;
  appStateSub?.remove();
  appStateSub = null;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type ReadOutcome =
  | { kind: "ok"; reading: LocationReading }
  | { kind: "denied"; canAskAgain: boolean }
  /** No fix in 10 s, or the system prompt never answered (30 s). */
  | { kind: "timeout" }
  | { kind: "unavailable" }
  /** iOS Precise Location off / Android approximate only (3a). Not reported. */
  | { kind: "precise"; reading: LocationReading }
  | { kind: "accuracy"; reading: LocationReading }
  | { kind: "movement"; reading: LocationReading }
  /** The report RPC failed (network, unknown answer). */
  | { kind: "error"; reading: LocationReading };

/**
 * One reading (fast path: last known, Balanced, High), reported as
 * `go_live`. `ask`: the system prompt may show.
 */
async function readAndReport(ask: boolean): Promise<ReadOutcome> {
  const loc = await readLocationOnce({ ask, fast: true });
  if (loc.status === "denied") return { kind: "denied", canAskAgain: loc.canAskAgain };
  if (loc.status === "unavailable") return loc.reason === "timeout" ? { kind: "timeout" } : { kind: "unavailable" };
  const reading = loc.reading;
  // Kilometre-scale: the server would only refuse it, and the athlete needs
  // the Precise Location setting, not a window.
  if (loc.reducedPrecision) return { kind: "precise", reading };
  const res = await reportGoLivePresence(supabase, reading);
  if (!res.ok) {
    console.warn("[location] go_live report failed:", res.error.hint, res.error.message);
    return { kind: "error", reading };
  }
  if (!res.data.ok) {
    if (res.data.code === "accuracy_too_low") return { kind: "accuracy", reading };
    // An implied speed over 50 m/s from the previous reading: say so, and
    // only the athlete's own Retry sends another reading.
    if (res.data.code === "implausible_movement") return { kind: "movement", reading };
    return { kind: "error", reading };
  }
  return { kind: "ok", reading };
}

interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
}

async function permissionState(): Promise<PermissionState> {
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

export interface GoLiveLocationResult {
  outcome: GoLiveLocationOutcome;
  /** The attempt's outcome, as `log_location_event` records it (4.5). */
  attempt: LocationEventOutcome;
  /** The last reading taken, when there was one. */
  reading: LocationReading | null;
}

/** A failure sheet and the outcome an athlete leaving it is logged with. */
const FAILURE_SHEETS: Record<
  Exclude<ReadOutcome["kind"], "ok" | "denied" | "error">,
  { phase: GoLiveLocationPhase; attempt: LocationEventOutcome }
> = {
  timeout: { phase: "unavailable", attempt: "timeout" },
  unavailable: { phase: "unavailable", attempt: "unavailable" },
  precise: { phase: "precise", attempt: "accuracy_too_low" },
  accuracy: { phase: "accuracy", attempt: "accuracy_too_low" },
  movement: { phase: "movement", attempt: "implausible_movement" },
};

/** Sheets shown (and answered) per flow before it gives up. */
const MAX_STEPS = 8;

/**
 * The interactive location step of a Go Live the athlete tapped: explain
 * (re-askable), denied with Retry (not re-askable), the reading, and a
 * failure sheet with Retry for each way a reading can fail.
 */
export async function ensureGoLiveLocation(opts: { flow?: GoLiveFlow } = {}): Promise<GoLiveLocationResult> {
  const flow = opts.flow ?? beginFlow();
  try {
    return await locationStep(flow);
  } finally {
    if (!opts.flow) endFlow(flow);
  }
}

async function locationStep(flow: GoLiveFlow): Promise<GoLiveLocationResult> {
  const end = (attempt: LocationEventOutcome, reading: LocationReading | null = null): GoLiveLocationResult => {
    closeSheet();
    return { outcome: "declined", attempt, reading };
  };
  let perm = await permissionState();
  let last: LocationEventOutcome = "dismissed";
  let reading: LocationReading | null = null;
  for (let step = 0; step < MAX_STEPS; step++) {
    if (flow.aborted) return end("dismissed", reading);
    if (!perm.granted) {
      if (perm.canAskAgain) {
        // Explain first, then the system prompt (asked by the reading below).
        // Closed before any reading, or backgrounded: dismissed.
        if ((await present("explain")) !== "continue") return end("dismissed", reading);
      } else {
        const choice = await present("denied");
        if (choice === "background") return end("dismissed", reading);
        // Not now, or Open Settings: the athlete left on the denied state.
        if (choice !== "retry") return end("permission_denied", reading);
        // The athlete may have turned it on in Settings meanwhile.
        perm = await permissionState();
        last = "permission_denied";
        continue;
      }
    }
    const r = await readAndReport(true);
    if (flow.aborted) return end("dismissed", "reading" in r ? r.reading : reading);
    if (r.kind === "ok") {
      closeSheet();
      return { outcome: "ready", attempt: "ok", reading: r.reading };
    }
    if (r.kind === "error") {
      closeSheet();
      return { outcome: "failed", attempt: "error", reading: r.reading };
    }
    if (r.kind === "denied") {
      // Re-askable (Android's first "Deny"): explain again; otherwise denied.
      perm = { granted: false, canAskAgain: r.canAskAgain };
      last = "permission_denied";
      continue;
    }
    const fail = FAILURE_SHEETS[r.kind];
    if ("reading" in r) reading = r.reading;
    const choice = await present(fail.phase);
    if (choice === "background") return end("dismissed", reading);
    // Left from a failure sheet: that sheet's reason, not "dismissed".
    if (choice !== "retry") return end(fail.attempt, reading);
    // The reading re-checks (and if it can, re-asks) the permission itself.
    perm = { granted: true, canAskAgain: true };
    last = fail.attempt;
  }
  return end(last, reading);
}

/**
 * The whole flag-ON go-live the athlete tapped: the location step, then
 * `goLive()`. A live write the server still refuses with `location_required`
 * (the reading went stale, or was scrubbed) shows the no-fix state with
 * Retry, or goes back through explain / denied when permission is gone.
 * Resolves like `arenaActions.goLive`: true live, false failed (say so),
 * "ignored" when the athlete closed a location state (already explained).
 * Logs one `go_live_attempt` with the flow's final outcome (4.5).
 */
export async function goLiveWithLocation(
  goLive: () => Promise<boolean>,
  lastRefusal: () => string | null,
): Promise<boolean | LiveSwitchIgnored> {
  const flow = beginFlow();
  let attempt: LocationEventOutcome = "location_required";
  let reading: LocationReading | null = null;
  try {
    for (let i = 0; i < 3; i++) {
      const ready = await ensureGoLiveLocation({ flow });
      reading = ready.reading ?? reading;
      if (ready.outcome !== "ready") {
        attempt = ready.attempt;
        return ready.outcome === "declined" ? "ignored" : false;
      }
      // Backgrounded while the sheet or the reading was up: never advertise
      // an athlete whose app is closed.
      if (flow.aborted || AppState.currentState !== "active") {
        attempt = "dismissed";
        return "ignored";
      }
      const ok = await goLive();
      if (ok) {
        attempt = "ok";
        return true;
      }
      if (lastRefusal() !== "location_required") {
        attempt = "error";
        return false;
      }
      attempt = "location_required";
      if (flow.aborted) return "ignored";
      // Permission gone: the next pass explains (re-askable) or shows denied.
      if (!(await permissionState()).granted) continue;
      const choice = await present("unavailable");
      if (choice !== "retry") {
        if (choice === "background") attempt = "dismissed";
        closeSheet();
        return "ignored";
      }
    }
    closeSheet();
    return false;
  } finally {
    endFlow(flow);
    logGoLiveAttempt(attempt, reading);
  }
}

// ---------------------------------------------------------------------------
// Silent readings (restores and the 60 s refresh)
// ---------------------------------------------------------------------------

/**
 * `ready`: reported. `permission`: location permission is not granted (an
 * "Allow Once" grant lapsed, or it was turned off): the caller offers the
 * tap-to-go-live CTA and never writes live. `failed`: the report failed
 * (network). `unavailable`: no usable reading (no fix, too coarse, refused).
 */
export type SilentReadingOutcome = "ready" | "permission" | "failed" | "unavailable";

/**
 * A reading the athlete did not tap for (a restore, the 60 s refresh):
 * never asks and never shows anything. Not logged (decision D8).
 */
export async function silentGoLiveReading(): Promise<SilentReadingOutcome> {
  const r = await readAndReport(false);
  if (r.kind === "ok") return "ready";
  if (r.kind === "denied") return "permission";
  if (r.kind === "error") return "failed";
  return "unavailable";
}

export interface GoLiveRefreshHandlers {
  /** Permission is gone while live: once per failure streak (1d). */
  onPermissionLost?: () => void;
  /** Any tick that did not report a reading (the server may expire the session). */
  onNotReady?: (outcome: Exclude<SilentReadingOutcome, "ready">) => void;
}

/**
 * Refresh the `go_live` reading every 60 s while `active` (live, flag on,
 * not in a match) and the app is in the foreground. Silent: never asks. A
 * lost permission calls `onPermissionLost` once per streak of failing ticks
 * (a tick that reports again ends the streak, and so does going offline).
 */
export function useGoLiveReadingRefresh(active: boolean, handlers: GoLiveRefreshHandlers = {}): void {
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;
  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let streak = false;
    let inflight = false;
    const t = setInterval(() => {
      if (AppState.currentState !== "active" || inflight) return;
      inflight = true;
      void silentGoLiveReading()
        .then((r) => {
          if (cancelled) return;
          if (r === "ready") {
            streak = false;
            return;
          }
          if (r === "permission" && !streak) {
            streak = true;
            handlersRef.current.onPermissionLost?.();
          }
          handlersRef.current.onNotReady?.(r);
        })
        .catch(() => undefined)
        .finally(() => {
          inflight = false;
        });
    }, GO_LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [active]);
}
