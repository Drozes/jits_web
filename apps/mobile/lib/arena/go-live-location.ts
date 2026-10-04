/**
 * Go Live with `match_location_required` ON: the location sheets, the flow
 * lifetime, and the interactive location step (explain, the system prompt,
 * denied with Retry, the failure sheets). The location LADDER that decides
 * whether a fresh reading is needed at all (server tag, device tag, OS
 * cache, fresh fix) is `location-ladder.ts` (jr_be 016 addendum, instant
 * go-live 4.2); this module is its rung 4, and the whole flow when the
 * backend predates the instant go-live migration (`presence-capability.ts`,
 * "legacy": a fresh reading before every go-live, as the build before).
 *
 * The athlete-facing states (explain, denied, poor accuracy, Precise Location
 * off, no fix) are a small store read by `<GoLiveLocationSheet />`, which
 * `<ArenaBootstrap />` mounts once beside the challenge prompt. Each one
 * waits on the athlete's answer, outside the live hook's serialized queue,
 * so a background landing while the sheet is up still takes the athlete
 * offline at once. While a sheet waits the chip draws `○ GO LIVE` under the
 * scrim (`hold`); once Continue / Retry make it busy, `◌ FINDING YOU`.
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
 * No reading is refreshed while live on a current backend (the 60 s refresh
 * is gone, instant go-live 4.2). `useLegacyGoLiveReadingRefresh` keeps it
 * only against a legacy backend, whose 10 minute expiry still needs it.
 * A reading the server ACCEPTS is kept on the device as the athlete's last
 * location (`lib/location/device-location-store.ts`); a refused one never is.
 */
import * as React from "react";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { reportGoLivePresence, type LocationEventOutcome } from "@jits/shared/api/location";
import type { LocationReading } from "@jits/shared/api/invites";
import { supabase } from "@/lib/supabase/client";
import { permissionRequestInFlight, readLocationOnce } from "@/lib/invites/location";
import { recordAcceptedReading } from "@/lib/location/device-location-store";
import { notePresenceAnswer } from "@/lib/location/presence-capability";
import { setGoLiveDisplay, type LiveSwitchIgnored } from "./arena-store";
import { logGoLiveAttempt } from "./location-telemetry";

/**
 * How often a live athlete's `go_live` reading is refreshed against a
 * LEGACY backend only (its 10 minute expiry needs it; contract 6).
 */
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
  // The attempt is waiting on the athlete, not on a fix: no pending state
  // under the scrim (UX 019, 3c step 3).
  if (purpose === "go_live" && activeFlow) setGoLiveDisplay("hold");
  setSheet({ phase, busy: false, purpose });
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

/**
 * Close the sheet, but only one shown for `purpose`: a Go Live flow never
 * closes the challenger's `arena` explain (and vice versa). A wait still
 * open on the closed sheet is answered "cancel", never dropped, so its
 * owner always unwinds.
 */
function closeSheet(purpose: "go_live" | "arena" = "go_live") {
  if (sheet && (sheet.purpose ?? "go_live") !== purpose) return;
  const resolve = resolver;
  resolver = null;
  if (sheet) setSheet(null);
  resolve?.("cancel");
}

/** The sheet's buttons. Continue / Retry keep it up (busy) while reading. */
export function answerGoLiveLocation(choice: Exclude<GoLiveLocationChoice, "background">): void {
  const resolve = resolver;
  resolver = null;
  // The athlete's own tap on the sheet on screen, whatever its purpose.
  if (choice === "cancel") {
    if (sheet) setSheet(null);
  } else if (sheet) {
    // Continue / Retry: a fix is running now (FINDING YOU under the sheet).
    if ((sheet.purpose ?? "go_live") === "go_live" && activeFlow) setGoLiveDisplay("finding-you");
    setSheet({ ...sheet, busy: true });
  }
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

/** The challenger's close: only its own `arena` sheet. */
export function closeLocationSheet(): void {
  closeSheet("arena");
}

/** The ladder's rung 4 shows the no-fix sheet after a refused live write. */
export function presentGoLiveLocation(phase: GoLiveLocationPhase): Promise<GoLiveLocationChoice> {
  return present(phase);
}

/** Close the Go Live sheet (the flow is done with it). */
export function closeGoLiveSheet(): void {
  closeSheet("go_live");
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

/**
 * One athlete-initiated Go Live flow. `aborted` once the app went to the
 * background (not for a permission prompt, see below); `abortSignal`
 * resolves at that moment, so a reading in flight is not waited on.
 */
export interface GoLiveFlow {
  aborted: boolean;
  abortSignal: Promise<"aborted">;
  abort: () => void;
}

let activeFlow: GoLiveFlow | null = null;
let appStateSub: { remove: () => void } | null = null;

function newFlow(): GoLiveFlow {
  let fire!: () => void;
  const flow: GoLiveFlow = {
    aborted: false,
    abortSignal: new Promise<"aborted">((resolve) => {
      fire = () => resolve("aborted");
    }),
    abort: () => {
      if (flow.aborted) return;
      flow.aborted = true;
      fire();
    },
  };
  return flow;
}

export function beginFlow(): GoLiveFlow {
  const flow = newFlow();
  activeFlow = flow;
  if (!appStateSub) {
    appStateSub = AppState.addEventListener("change", (next) => {
      // "inactive" is the iOS system prompt, the notification shade or the
      // app switcher: only a real background ends the flow. On Android the
      // runtime permission dialog itself pauses the activity and reads as
      // "background": that is not the athlete leaving, so it is ignored
      // while a permission request is in flight. Whether the app is in the
      // foreground is checked again before the live write.
      if (next !== "background" || !activeFlow || permissionRequestInFlight()) return;
      activeFlow.abort();
      cancelLocationSheet("go_live", "background");
    });
  }
  return flow;
}

/** How long the live write waits for the app to come back to "active". */
export const ACTIVE_WAIT_MS = 1_500;

/**
 * The decision point before the live write: the app is in the foreground
 * now, or comes back within `ms` (Android reports "active" again only after
 * the permission dialog has closed, which can trail its answer).
 */
export function waitForActive(flow: GoLiveFlow, ms = ACTIVE_WAIT_MS): Promise<boolean> {
  if (AppState.currentState === "active") return Promise.resolve(true);
  return new Promise((resolve) => {
    let sub: { remove: () => void } | null = null;
    const done = (v: boolean) => {
      clearTimeout(timer);
      sub?.remove();
      resolve(v);
    };
    const timer = setTimeout(() => done(AppState.currentState === "active"), ms);
    sub = AppState.addEventListener("change", (next) => {
      if (next === "active") done(true);
    });
    void flow.abortSignal.then(() => done(false));
  });
}

export function endFlow(flow: GoLiveFlow): void {
  if (activeFlow !== flow) return;
  activeFlow = null;
  appStateSub?.remove();
  appStateSub = null;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type ReadOutcome =
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
 * Report a fresh reading as `go_live` (no capture time: the server uses its
 * receive time, exactly the call an older backend accepts). The default
 * reporter; the ladder passes one that retries through a network blip.
 */
export type FreshReporter = (reading: LocationReading, capturedAt: number) => Promise<ReadOutcome>;

export const reportFreshOnce: FreshReporter = async (reading, capturedAt) => {
  const res = await reportGoLivePresence(supabase, reading);
  if (!res.ok) {
    console.warn("[location] go_live report failed:", res.error.hint, res.error.message);
    return { kind: "error", reading };
  }
  notePresenceAnswer(res.data);
  if (!res.data.ok) {
    if (res.data.code === "accuracy_too_low") return { kind: "accuracy", reading };
    // An implied speed over 50 m/s from the previous reading: say so, and
    // only the athlete's own Retry sends another reading.
    if (res.data.code === "implausible_movement") return { kind: "movement", reading };
    return { kind: "error", reading };
  }
  recordAcceptedReading("go_live", reading, capturedAt, res.data);
  return { kind: "ok", reading };
};

export interface ReadOptions {
  /** The ladder's rung 3 already looked at the OS cache. */
  skipLastKnown?: boolean;
  reporter?: FreshReporter;
}

/**
 * One reading (fast path: last known, Balanced, High), reported as
 * `go_live`. `ask`: the system prompt may show.
 */
async function readAndReport(ask: boolean, opts: ReadOptions = {}): Promise<ReadOutcome> {
  const loc = await readLocationOnce({ ask, fast: true, ...(opts.skipLastKnown ? { skipLastKnown: true } : {}) });
  if (loc.status === "denied") return { kind: "denied", canAskAgain: loc.canAskAgain };
  if (loc.status === "unavailable") return loc.reason === "timeout" ? { kind: "timeout" } : { kind: "unavailable" };
  const reading = loc.reading;
  // Kilometre-scale: the server would only refuse it, and the athlete needs
  // the Precise Location setting, not a window.
  if (loc.reducedPrecision) return { kind: "precise", reading };
  return (opts.reporter ?? reportFreshOnce)(reading, loc.capturedAt ?? Date.now());
}

export interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
  /** Android approximate location only (no reading can pass 100 m). */
  coarse?: boolean;
}

/** The last permission state read, for synchronous first-frame decisions. */
let lastPermission: PermissionState | null = null;

export function lastKnownPermission(): PermissionState | null {
  return lastPermission;
}

/** The foreground location permission, read (never asked). */
export async function permissionState(): Promise<PermissionState> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    lastPermission = {
      granted: Boolean(p.granted),
      canAskAgain: Boolean(p.canAskAgain),
      ...((p as { android?: { accuracy?: string } }).android?.accuracy === "coarse" ? { coarse: true } : {}),
    };
  } catch {
    lastPermission = { granted: false, canAskAgain: false };
  }
  return lastPermission;
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
export async function ensureGoLiveLocation(
  opts: { flow?: GoLiveFlow } & ReadOptions = {},
): Promise<GoLiveLocationResult> {
  const flow = opts.flow ?? beginFlow();
  try {
    return await locationStep(flow, opts);
  } finally {
    if (!opts.flow) endFlow(flow);
  }
}

async function locationStep(flow: GoLiveFlow, opts: ReadOptions = {}): Promise<GoLiveLocationResult> {
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
    // A background mid-reading resolves the flow at once (the chip goes back
    // to offline), not after the fix and the report finish.
    const r = await Promise.race([readAndReport(true, opts), flow.abortSignal]);
    if (r === "aborted" || flow.aborted) return end("dismissed", r !== "aborted" && "reading" in r ? r.reading : reading);
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
      // an athlete whose app is closed. After a permission prompt the app
      // may still be on its way back to "active" (Android), so wait briefly.
      if (flow.aborted || !(await waitForActive(flow))) {
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
// Silent readings (legacy backend: restores and the 60 s refresh)
// ---------------------------------------------------------------------------

/**
 * `ready`: reported. `permission`: location permission is not granted (an
 * "Allow Once" grant lapsed, or it was turned off): the caller offers the
 * tap-to-go-live CTA and never writes live. `failed`: the report failed
 * (network). `unavailable`: no usable reading (no fix, too coarse, refused).
 */
export type SilentReadingOutcome = "ready" | "permission" | "failed" | "unavailable";

/**
 * A reading the athlete did not tap for: never asks and never shows
 * anything. Not logged (decision D8). `skipLastKnown`: the ladder's rung 3
 * already looked at the OS cache.
 */
export async function silentGoLiveReading(opts: ReadOptions = {}): Promise<SilentReadingOutcome> {
  const r = await readAndReport(false, opts);
  if (r.kind === "ok") return "ready";
  if (r.kind === "denied") return "permission";
  if (r.kind === "error") return "failed";
  return "unavailable";
}

/** The outcome of a silent fresh fix, with why it failed (the restore toasts). */
export async function silentFreshFix(opts: ReadOptions = {}): Promise<ReadOutcome> {
  return readAndReport(false, opts);
}

export interface GoLiveRefreshHandlers {
  /** Permission is gone while live: once per failure streak (1d). */
  onPermissionLost?: () => void;
  /** Any tick that did not report a reading (the server may expire the session). */
  onNotReady?: (outcome: Exclude<SilentReadingOutcome, "ready">) => void;
}

/**
 * LEGACY BACKEND ONLY (`presence-capability.ts` says `legacy`): refresh the
 * `go_live` reading every 60 s while `active` (live, flag on, not in a
 * match) and the app is in the foreground, because an older server expires
 * a live session after 10 minutes without one. A current backend has no
 * such expiry, and this never runs against it (instant go-live 4.2 removed
 * the refresh). Silent: never asks. A lost permission calls
 * `onPermissionLost` once per streak of failing ticks.
 */
export function useLegacyGoLiveReadingRefresh(active: boolean, handlers: GoLiveRefreshHandlers = {}): void {
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
