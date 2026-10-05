/**
 * The location ladder (jr_be 016 addendum, instant go-live 4.2; UX spec
 * research/019-optimistic-go-live-ux.md): going live with
 * `match_location_required` ON needs a location TAG under 4 hours old at 100 m
 * or better, found fastest first. The first rung that lands ends the ladder:
 *
 *  1. Server tag: the device entry is a valid `go_live` tag, so the server
 *     still holds it: write live directly. Refused `location_required`
 *     (the server lost or replaced it): rung 2.
 *  2. Device-stored location: the device entry is valid (any context):
 *     report it as `go_live` with `p_captured_at`, then write live. Refused
 *     (`tag_too_old`, `implausible_movement`, `accuracy_too_low`,
 *     `captured_at_invalid`): the entry is deleted, rung 3.
 *  3. OS cached fix: only with permission ALREADY granted,
 *     `getLastKnownPositionAsync` (4 h minus margin, 100 m, checked again on
 *     its own timestamp and accuracy), reported with its timestamp.
 *  4. Fresh fix: the interactive location step (`go-live-location.ts`),
 *     the only rung that waits on GPS and the only one that may ask for
 *     permission, and only after the athlete's tap.
 *
 * NEVER LIVE WITHOUT A TAG. Every live write either follows a report the
 * server accepted, or is rung 1, where the server itself checks the tag
 * (trg_04, HINT `location_required`). No rung writes live on a hunch.
 *
 * OPTIMISTIC CHIP (UX 019, C1, orchestrator ruling): when the device holds
 * a valid tag (rungs 1 and 2, a kept fresh fix, or the OS cache) and is not
 * known to be offline, the chip is DRAWN live on the tap (`optimistic`),
 * while `isLive` stays false until the server confirms. If the write has
 * not landed in 5 s, or fails for a network reason, the chip shows
 * RECONNECTING and the write retries with backoff; nothing lands within
 * 15 s of the tap: OFFLINE · RETRY. A server REFUSAL moves to the next rung
 * with the chip still green (rungs 1 to 3 are a round trip or two); only
 * when every cached rung is refused and a fresh fix is needed does it drop
 * to FINDING YOU (the one flicker the spec allows). It never stays green
 * when the server says not live.
 *
 * RESTORES (foreground, after a match, cold start) run the same ladder
 * without any UI that asks: rungs 1 to 3, then rung 4 only with permission
 * already granted. Drawn live from the first frame with a valid tag, FINDING
 * YOU without one (UX 019, C2). No rung lands: no live write, one toast.
 *
 * THE RECOVERY WINDOW (15 s) covers network phases only (review round 1,
 * B1): it starts at the tap for rungs 1 to 3, and starts again whenever a
 * report follows an interactive wait (a sheet, the system dialog, a fresh
 * fix). It only stops NEW retries: a write or report already in flight is
 * always awaited, and its answer is final, so a late success is a success
 * and nothing says "failed" before the server has.
 *
 * OLD BACKEND: a replay with `p_captured_at` answered `PGRST202` means the
 * instant go-live migration is not on the server yet: the capability flips
 * to `legacy` and the ladder falls to the fresh reading (rung 4), exactly
 * the old flow. Later attempts in this process skip the ladder entirely.
 */
import { AppState } from "react-native";
import {
  BACKGROUND_REFRESH_AFTER_MS,
  GO_LIVE_TAG_MARGIN_MS,
  GO_LIVE_TAG_MAX_AGE_MS,
  type GoLiveTagSource,
} from "@jits/shared/constants/go-live";
import { reportGoLivePresence, type LocationEventOutcome } from "@jits/shared/api/location";
import { isMissingRpcSignature } from "@jits/shared/api/invite-rpc";
import type { LocationReading } from "@jits/shared/api/invites";
import { supabase } from "@/lib/supabase/client";
import { readLocationOnce, readOsCachedFix } from "@/lib/invites/location";
import {
  clearDeviceReading,
  clearDeviceTag,
  getDeviceLocationOwner,
  isDeviceLocationLoaded,
  loadDeviceLocation,
  recordAcceptedReading,
  validDeviceReading,
  validDeviceTag,
} from "@/lib/location/device-location-store";
import {
  getPresenceCapability,
  notePresenceAnswer,
  setPresenceCapability,
} from "@/lib/location/presence-capability";
import { isKnownOffline } from "@/lib/network/connectivity";
import {
  clearGoLiveDisplayWhenLive,
  getGoLiveDisplay,
  isInArenaMatch,
  PENDING_REVEAL_MS,
  scheduleGoLiveReveal,
  setGoLiveDisplay,
  setNeedsLocation,
  setRestoreInFlight,
  type LiveSwitchIgnored,
} from "./arena-store";
import { ANNOUNCE_FINDING, ANNOUNCE_LIVE, ANNOUNCE_RECONNECTING, announce } from "./go-live-announce";
import {
  showLocationFixFailedGoLiveCta,
  showLocationOffGoLiveCta,
  showRestoreFailedToast,
} from "./go-live-feedback";
import {
  beginFlow,
  closeGoLiveSheet,
  endFlow,
  ensureGoLiveLocation,
  goLiveWithLocation,
  lastKnownPermission,
  permissionState,
  presentGoLiveLocation,
  silentFreshFix,
  silentGoLiveReading,
  waitForActive,
  type FreshReporter,
  type GoLiveFlow,
  type ReadOutcome,
} from "./go-live-location";
import { logGoLiveAttempt } from "./location-telemetry";
import { markMatchLocationRequired, readMatchLocationRequired } from "./match-location-flag";
import { withDevFault } from "./dev-go-live-hooks";

// ---------------------------------------------------------------------------
// Timings (UX 019, 2.3)
// ---------------------------------------------------------------------------

/** Longest the OS cached fix lookup is waited on before it counts as absent. */
export const OS_CACHE_BUDGET_MS = 500;
/** Longest the chip shows green before the server confirms; then RECONNECTING. */
export const OPTIMISTIC_CONFIRM_MS = 5_000;
/** Total time the app keeps trying silently before giving up with one message. */
export const RECOVERY_WINDOW_MS = 15_000;
/** FINDING YOU is announced only when it lasts longer than this. */
export const FINDING_ANNOUNCE_AFTER_MS = 1_000;
/** Backoff between retries of a write or report that failed for a network reason. */
export const RECOVERY_BACKOFF_MS: readonly number[] = [1_000, 2_000, 4_000];
/** A fresh fix whose report could not land is kept this long for Retry (UX 019, 3g). */
export const UNREPORTED_FIX_MAX_AGE_MS = 2 * 60 * 1000;
/** A restore waits this long on the flag read, then goes by the owner's hint (S2). */
export const FLAG_READ_BOUND_MS = 3_000;
/** The device-side tag window (4 h minus the 2 minute margin). */
const TAG_WINDOW_MS = GO_LIVE_TAG_MAX_AGE_MS - GO_LIVE_TAG_MARGIN_MS;

/** The live write, owned by `useArenaLive` (serialized there). */
export interface LiveWriter {
  athleteId: string;
  /** `useArenaLive().goLive`: resolves true once the flag write landed. */
  write: () => Promise<boolean>;
  /** Why the last write was refused, when the server said. */
  lastRefusal: () => "location_required" | null;
}

/** A restore may only write while the app is in front, out of a match, and still wanted. */
export interface RestoreWriter extends LiveWriter {
  canWrite: () => "ok" | "parked" | "cancelled";
  /**
   * `match_location_required` as the owner last knew it (false while still
   * unknown), for the first frame only: off means the plain write, drawn
   * live. The flag itself is read before anything else is decided.
   */
  locationRequiredHint?: boolean;
}

interface Tag {
  reading: LocationReading;
  /** Capture time, ms epoch. */
  capturedAt: number;
}

// ---------------------------------------------------------------------------
// A fresh fix kept for Retry
// ---------------------------------------------------------------------------

let unreportedFix: Tag | null = null;

function takeUnreportedFix(now: number = Date.now()): Tag | null {
  const fix = unreportedFix;
  unreportedFix = null;
  return fix && now - fix.capturedAt < UNREPORTED_FIX_MAX_AGE_MS ? fix : null;
}

// ---------------------------------------------------------------------------
// One attempt: its clock, its display and its announcements
// ---------------------------------------------------------------------------

class Attempt {
  readonly t0 = Date.now();
  /** End of the current network phase's recovery window. */
  private deadline = this.t0 + RECOVERY_WINDOW_MS;
  /** The chip is drawn green right now on this attempt's say-so. */
  green = false;
  private announcedLive = false;
  private announcedReconnecting = false;
  private announcedFinding = false;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    readonly tapped: boolean,
    readonly flow: GoLiveFlow | null,
  ) {}

  aborted(): boolean {
    return this.flow?.aborted ?? false;
  }

  timeLeft(): number {
    return this.deadline - Date.now();
  }

  /**
   * A network phase begins after an interactive wait (a sheet, the system
   * dialog, a fresh fix): it gets its own full window (B1). Time the athlete
   * spent on a sheet never counts against the network.
   */
  restartWindow(): void {
    this.deadline = Date.now() + RECOVERY_WINDOW_MS;
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, Math.max(0, ms)));
  }

  /** Draw the chip live now (a valid tag is in hand). */
  flip(): void {
    this.green = true;
    setGoLiveDisplay(this.tapped ? "optimistic" : "restore-live");
    if (!this.tapped) return;
    if (!this.announcedLive) {
      this.announcedLive = true;
      announce(ANNOUNCE_LIVE);
    }
    // No server answer within 5 s of the tap: RECONNECTING.
    this.later(this.t0 + OPTIMISTIC_CONFIRM_MS - Date.now(), () => this.recovering());
  }

  /** A write or report did not land at once: RECONNECTING, only over a green chip. */
  recovering(): void {
    if (!this.green) return;
    const d = getGoLiveDisplay();
    if (d !== "optimistic" && d !== "restore-live") return;
    setGoLiveDisplay("recovering");
    if (this.tapped && !this.announcedReconnecting) {
      this.announcedReconnecting = true;
      announce(ANNOUNCE_RECONNECTING);
    }
  }

  /** A fresh fix is starting: FINDING YOU (after the 240 ms hold on a tap). */
  finding(): void {
    const kind = this.tapped ? "finding-you" : "restore-finding";
    if (this.green || !this.tapped || getGoLiveDisplay() === "going-live") {
      // Green (or a restore) and now a fresh fix: the one allowed flicker.
      // GOING LIVE already drawn (the OS cache lookup ran past 240 ms): the
      // one label change allowed inside an attempt.
      this.green = false;
      setGoLiveDisplay(kind);
    } else {
      scheduleGoLiveReveal(kind, this.t0 + PENDING_REVEAL_MS);
    }
    if (this.tapped) this.armFindingAnnouncement();
  }

  private armFindingAnnouncement(): void {
    if (this.announcedFinding) return;
    const shownAt = Math.max(Date.now(), this.t0 + PENDING_REVEAL_MS);
    this.later(shownAt + FINDING_ANNOUNCE_AFTER_MS - Date.now(), () => {
      if (this.announcedFinding || getGoLiveDisplay() !== "finding-you") return;
      this.announcedFinding = true;
      announce(ANNOUNCE_FINDING);
    });
  }

  /** The server confirmed: "You're live" for a tap that never flipped green. */
  confirmed(): void {
    this.dispose();
    if (this.tapped && !this.announcedLive) {
      this.announcedLive = true;
      announce(ANNOUNCE_LIVE);
    }
  }

  /** Wait `ms`, but never past the deadline; false when the flow was aborted meanwhile. */
  async pause(ms: number): Promise<boolean> {
    const wait = Math.max(0, Math.min(ms, this.timeLeft()));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slept = new Promise<"slept">((resolve) => {
      timer = setTimeout(() => resolve("slept"), wait);
    });
    const r = await (this.flow ? Promise.race([slept, this.flow.abortSignal]) : slept);
    clearTimeout(timer);
    return r === "slept" && !this.aborted();
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}

// ---------------------------------------------------------------------------
// The two round trips, each with silent recovery
// ---------------------------------------------------------------------------

type WriteResult = "ok" | "refused" | "network" | "aborted" | "parked" | "cancelled";

/**
 * The live write. Refused (`location_required`): the server holds no valid
 * tag, the caller moves on. A network failure retries with backoff until the
 * recovery window is spent (RECONNECTING over a green chip).
 */
async function writeLive(a: Attempt, w: LiveWriter, canWrite?: () => "ok" | "parked" | "cancelled"): Promise<WriteResult> {
  for (let i = 0; ; i++) {
    if (a.aborted()) return "aborted";
    // Backgrounded while the sheet or the reading was up: never advertise an
    // athlete whose app is closed (Android: wait for "active" to come back
    // after the permission dialog).
    if (a.flow && !(await waitForActive(a.flow))) return "aborted";
    if (canWrite) {
      const c = canWrite();
      if (c !== "ok") return c;
    }
    // Never raced against the window: the write in flight is always awaited
    // and its answer is final (a late success is a success, B1).
    const r = await withDevFault("write", () => w.write().catch(() => false), false);
    if (r) return "ok";
    if (w.lastRefusal() === "location_required") return "refused";
    if (a.timeLeft() <= 0) return "network";
    a.recovering();
    if (!(await a.pause(RECOVERY_BACKOFF_MS[Math.min(i, RECOVERY_BACKOFF_MS.length - 1)]))) {
      return a.aborted() ? "aborted" : "network";
    }
  }
}

type ReportResult =
  | { kind: "ok" }
  | { kind: "refused"; code: string }
  | { kind: "legacy" }
  | { kind: "network" }
  | { kind: "aborted" };

/**
 * Report a reading as `go_live`. `sendCapturedAt`: the capture time for a
 * replayed tag (rungs 2 and 3, a kept fix), null for a reading taken just
 * now (rung 4, the refresh: the server uses its receive time). Accepted:
 * kept on the device as the athlete's last location.
 */
async function reportTag(
  a: Attempt,
  athleteId: string,
  reading: LocationReading,
  sendCapturedAt: number | null,
  deviceCapturedAt: number,
): Promise<ReportResult> {
  for (let i = 0; ; i++) {
    if (a.aborted()) return { kind: "aborted" };
    // Awaited, never raced (B1): a report that lands late still counts.
    const res = await withDevFault(
      "report",
      () => reportGoLivePresence(supabase, reading, { capturedAt: sendCapturedAt }),
      { ok: false as const, error: { hint: "unknown", message: "network" } },
    );
    if (!res.ok) {
      // The older backend has no `p_captured_at`: never resend without it
      // (it would store a replayed location as fresh). Fresh reading instead.
      if (sendCapturedAt !== null && isMissingRpcSignature(res.error)) {
        setPresenceCapability("legacy");
        return { kind: "legacy" };
      }
      console.warn("[location] go_live report failed:", res.error.hint, res.error.message);
      if (a.timeLeft() <= 0) return { kind: "network" };
      a.recovering();
      if (!(await a.pause(RECOVERY_BACKOFF_MS[Math.min(i, RECOVERY_BACKOFF_MS.length - 1)]))) {
        return a.aborted() ? { kind: "aborted" } : { kind: "network" };
      }
      continue;
    }
    notePresenceAnswer(res.data);
    if (!res.data.ok) return { kind: "refused", code: res.data.code };
    // The server kept a FRESHER tag than this replay (a tag never moves
    // backwards, D2): it is the server's, not this reading; keep the store.
    const kept = res.data.captured_at ? Date.parse(res.data.captured_at) : NaN;
    if (!(Number.isFinite(kept) && sendCapturedAt !== null && kept > sendCapturedAt + 1_000)) {
      recordAcceptedReading("go_live", reading, deviceCapturedAt, res.data, athleteId);
    }
    return { kind: "ok" };
  }
}

/**
 * A fresh reading's reporter for rung 4 (with the same silent recovery). The
 * fix (and any sheet or system dialog before it) is over: the report starts
 * a fresh recovery window (B1).
 */
function freshReporter(a: Attempt, athleteId: string): FreshReporter {
  return async (reading, capturedAt) => {
    a.restartWindow();
    const r = await reportTag(a, athleteId, reading, null, capturedAt);
    if (r.kind === "ok") return { kind: "ok", reading };
    if (r.kind === "refused") {
      if (r.code === "accuracy_too_low") return { kind: "accuracy", reading };
      if (r.code === "implausible_movement") return { kind: "movement", reading };
      return { kind: "error", reading };
    }
    // Could not land (network): kept, so a Retry within 2 minutes is instant.
    if (r.kind === "network") unreportedFix = { reading, capturedAt };
    return { kind: "error", reading };
  };
}

type ReplayResult =
  | { kind: "live" }
  | { kind: "next"; code: string | null }
  | { kind: "legacy" }
  | { kind: "network" }
  | { kind: "aborted" }
  | { kind: "parked" }
  | { kind: "cancelled" };

/** Rungs 2 and 3 (and a kept fresh fix): report the tag with its capture time, then write. */
async function replay(
  a: Attempt,
  w: LiveWriter,
  tag: Tag,
  canWrite?: () => "ok" | "parked" | "cancelled",
): Promise<ReplayResult> {
  if (canWrite) {
    const c = canWrite();
    if (c !== "ok") return { kind: c };
  }
  const rep = await reportTag(a, w.athleteId, tag.reading, tag.capturedAt, tag.capturedAt);
  if (rep.kind === "refused") return { kind: "next", code: rep.code };
  if (rep.kind !== "ok") return rep;
  const wr = await writeLive(a, w, canWrite);
  if (wr === "ok") return { kind: "live" };
  if (wr === "refused") return { kind: "next", code: null };
  return { kind: wr };
}

function tagOf(entry: { lat: number; lng: number; accuracyM: number; capturedAt: number }): Tag {
  return { reading: { lat: entry.lat, lng: entry.lng, accuracyM: entry.accuracyM }, capturedAt: entry.capturedAt };
}

// ---------------------------------------------------------------------------
// Background refresh after a cached rung (4.2, D6)
// ---------------------------------------------------------------------------

/**
 * After a go-live from rung 1 (only when its tag is over 15 minutes old), 2
 * or 3, with permission ALREADY granted: one silent fresh reading reported
 * as `go_live`, to refresh the tag. Never awaited, never prompts, never
 * shows anything, never logged, and a failure never takes the athlete
 * offline (a refused reading never replaces the tag).
 */
export function scheduleBackgroundRefresh(source: GoLiveTagSource, tagCapturedAt: number): void {
  if (source === "fresh") return;
  // A young rung 1 tag needs no refresh, unless nothing has told this
  // process which backend it talks to yet: the refresh's go_live answer does
  // (a legacy backend then gets its 60 s refresh, which its 10 minute expiry
  // needs).
  if (
    source === "server_tag" &&
    Date.now() - tagCapturedAt <= BACKGROUND_REFRESH_AFTER_MS &&
    getPresenceCapability() !== "unknown"
  ) {
    return;
  }
  const runnable = () => AppState.currentState === "active" && !isInArenaMatch();
  // Stored only for the athlete this refresh was started for (N2).
  const athleteId = getDeviceLocationOwner();
  void (async () => {
    const perm = await permissionState();
    if (!perm.granted || perm.coarse || !runnable()) return;
    const loc = await readLocationOnce({ ask: false, fast: true, skipLastKnown: true });
    if (loc.status !== "ok" || loc.reducedPrecision || !runnable()) return;
    const res = await reportGoLivePresence(supabase, loc.reading);
    if (!res.ok) return;
    notePresenceAnswer(res.data);
    recordAcceptedReading("go_live", loc.reading, loc.capturedAt ?? Date.now(), res.data, athleteId);
  })().catch(() => undefined);
}

// ---------------------------------------------------------------------------
// The tap
// ---------------------------------------------------------------------------

/**
 * The whole flag-ON go-live the athlete tapped. Resolves like
 * `arenaActions.goLive`: true live, false failed (the chip shows OFFLINE ·
 * RETRY; Arena surfaces toast), "ignored" when the athlete closed a
 * location state (the sheet already said why). Logs one `go_live_attempt`
 * with the flow's final outcome and, on ok, the rung (`source`).
 */
export async function goLiveFromTap(w: LiveWriter): Promise<boolean | LiveSwitchIgnored> {
  if (getPresenceCapability() === "legacy") {
    // The backend predates the ladder: the old flow, a fresh reading first.
    scheduleGoLiveReveal("finding-you", Date.now() + PENDING_REVEAL_MS);
    return goLiveWithLocation(w.write, w.lastRefusal);
  }
  const flow = beginFlow();
  const a = new Attempt(true, flow);
  let attempt: LocationEventOutcome = "error";
  let source: GoLiveTagSource | null = null;
  let reading: LocationReading | null = null;
  let refusedOld = false;
  let freshReading = false;

  const succeed = (src: GoLiveTagSource, tag: Tag | null): true => {
    a.confirmed();
    attempt = "ok";
    source = src;
    reading = tag?.reading ?? reading;
    setNeedsLocation(false);
    if (tag) scheduleBackgroundRefresh(src, tag.capturedAt);
    return true;
  };
  const giveUp = (): false => {
    attempt = "error";
    setGoLiveDisplay("retry");
    return false;
  };
  const dismissed = (): LiveSwitchIgnored => {
    attempt = "dismissed";
    return "ignored";
  };

  try {
    await loadDeviceLocation(w.athleteId);
    // The go_live tag (rung 1, then replayed at rung 2) and the last browse
    // or arena reading (rung 2 only), kept apart (S3).
    const entry = validDeviceTag(w.athleteId);
    const stored = validDeviceReading(w.athleteId);
    const perm = await permissionState();
    let os: Tag | null = null;
    let osLooked = false;
    // Rung 3 looked up front when nothing else is in hand: it is evidence
    // for the flip, and it answers within 500 ms (GOING LIVE if it is
    // still running at 240 ms, from the guard's reveal).
    if (!entry && !stored && perm.granted) {
      os = await readOsCachedFix(TAG_WINDOW_MS, OS_CACHE_BUDGET_MS, perm.coarse === true);
      osLooked = true;
    }
    const kept = takeUnreportedFix();
    if (flow.aborted) return dismissed();
    const evidence = !!entry || !!stored || !!os || !!kept;
    if (evidence && !isKnownOffline()) a.flip();
    else if (!evidence && perm.granted) a.finding();
    // Evidence with no connection: GOING LIVE from the guard's 240 ms reveal.
    // No evidence and no permission: rung 4's sheet comes at once.

    const handle = (r: ReplayResult | { kind: WriteResult }): "live" | "next" | "stop" => {
      if (r.kind === "live" || r.kind === "ok") return "live";
      if (r.kind === "next" || r.kind === "refused" || r.kind === "legacy") return "next";
      return "stop";
    };
    // A network failure past the recovery window, or the flow aborted.
    const stop = (kind: string): boolean | LiveSwitchIgnored => (kind === "network" ? giveUp() : dismissed());

    // Rung 1: the server still holds this tag.
    if (entry) {
      const r = await writeLive(a, w);
      const h = handle({ kind: r });
      if (h === "live") return succeed("server_tag", tagOf(entry));
      if (h === "stop") return stop(r);
    }
    // Rung 2: the device-stored locations, each with its capture time: the
    // tag the server lost, then the last browse / arena reading.
    for (const [cand, clear] of [
      [entry, clearDeviceTag],
      [stored, clearDeviceReading],
    ] as const) {
      if (!cand || getPresenceCapability() === "legacy") continue;
      const r = await replay(a, w, tagOf(cand));
      if (r.kind === "live") return succeed("device", tagOf(cand));
      if (r.kind === "next") {
        clear(w.athleteId);
        if (r.code === "tag_too_old") refusedOld = true;
      } else if (r.kind !== "legacy") return stop(r.kind);
    }
    // A fresh fix whose report could not land a moment ago (Retry).
    if (kept && getPresenceCapability() !== "legacy") {
      const r = await replay(a, w, kept);
      if (r.kind === "live") return succeed("fresh", kept);
      if (r.kind === "next" && r.code === "tag_too_old") refusedOld = true;
      else if (r.kind !== "next" && r.kind !== "legacy") return stop(r.kind);
    }
    // Rung 3: the OS cache, only with permission already granted.
    if (perm.granted && getPresenceCapability() !== "legacy") {
      if (!osLooked) {
        os = await readOsCachedFix(TAG_WINDOW_MS, OS_CACHE_BUDGET_MS, perm.coarse === true);
        osLooked = true;
      }
      if (os) {
        const r = await replay(a, w, os);
        if (r.kind === "live") return succeed("os_cache", os);
        if (r.kind === "next" && r.code === "tag_too_old") refusedOld = true;
        else if (r.kind !== "next" && r.kind !== "legacy") return stop(r.kind);
      }
    }

    // Rung 4: a fresh fix (the explain sheet and system prompt come here,
    // after the tap, when permission is not granted).
    if (flow.aborted) return dismissed();
    a.finding();
    for (let i = 0; i < 3; i++) {
      const ready = await ensureGoLiveLocation({
        flow,
        skipLastKnown: osLooked,
        reporter: freshReporter(a, w.athleteId),
      });
      reading = ready.reading ?? reading;
      if (ready.reading) freshReading = true;
      if (ready.outcome !== "ready") {
        attempt = ready.attempt;
        if (ready.outcome === "declined") return "ignored";
        setGoLiveDisplay("retry");
        return false;
      }
      const wr = await writeLive(a, w);
      if (wr === "ok") return succeed("fresh", null);
      if (wr === "aborted") return dismissed();
      if (wr !== "refused") return giveUp();
      // The server still says no tag (the reading went stale or was
      // scrubbed): no fix, with Retry, or explain / denied when permission
      // is gone.
      attempt = "location_required";
      if (flow.aborted) return "ignored";
      if (!(await permissionState()).granted) continue;
      const choice = await presentGoLiveLocation("unavailable");
      if (choice !== "retry") {
        if (choice === "background") attempt = "dismissed";
        closeGoLiveSheet();
        return "ignored";
      }
    }
    closeGoLiveSheet();
    return false;
  } finally {
    a.dispose();
    endFlow(flow);
    if (attempt !== "ok") {
      // Ended for location (denied, or the explain closed without
      // permission): the offline chip tells VoiceOver why.
      const p = lastKnownPermission();
      setNeedsLocation(attempt === "permission_denied" || (attempt === "dismissed" && !!p && !p.granted));
    }
    // Only refused-as-old candidates and no fresh reading after them.
    if (attempt !== "ok" && refusedOld && !freshReading) attempt = "tag_too_old";
    logGoLiveAttempt(attempt, reading, source);
  }
}

// ---------------------------------------------------------------------------
// Restores (no tap: never asks, never a sheet)
// ---------------------------------------------------------------------------

/**
 * `live`: the athlete is live again. `failed`: not live; the one toast for
 * why is already up. `parked`: the app went to the background or into a
 * match mid-restore; the caller hands the intent on. `cancelled`: the
 * athlete went offline meanwhile; nothing to say.
 */
export type RestoreOutcome = "live" | "failed" | "parked" | "cancelled";

/**
 * What a restore draws from its first frame, decided synchronously from
 * memory: a valid stored tag or reading draws live; none, with permission
 * last seen granted, FINDING YOU; otherwise `hold` (GO LIVE, no taps, never
 * a GOING LIVE flash, N1). A store not read yet is `hold` too (S1): the
 * athlete row's load already started the read, so this is rare and brief.
 * Flag off (the owner's hint): the plain write, drawn live.
 */
export function restoreFirstFrame(
  athleteId: string,
  locationRequiredHint = true,
): "restore-live" | "restore-finding" | "hold" {
  if (!locationRequiredHint) return "restore-live";
  if (!isDeviceLocationLoaded(athleteId)) return "hold";
  if (validDeviceTag(athleteId) || validDeviceReading(athleteId)) return "restore-live";
  return lastKnownPermission()?.granted ? "restore-finding" : "hold";
}

/** The flag, but never waited on for longer than `FLAG_READ_BOUND_MS` (S2). */
async function boundedFlagRead(hint: boolean): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readMatchLocationRequired().catch(() => hint),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(hint), FLAG_READ_BOUND_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Put back a live state the app (not the athlete) took away: the ladder,
 * non-interactively. Never prompts, never a sheet, at most one toast. Not
 * logged (D8 of the previous addendum).
 */
export async function restoreLiveSilently(w: RestoreWriter): Promise<RestoreOutcome> {
  const hint = w.locationRequiredHint ?? true;
  setGoLiveDisplay(restoreFirstFrame(w.athleteId, hint));
  setRestoreInFlight(true);
  const a = new Attempt(false, null);
  let outcome: RestoreOutcome = "failed";
  const active = () => AppState.currentState === "active";
  const fail = (toast: () => void): RestoreOutcome => {
    if (active()) toast();
    return "failed";
  };
  const fromWrite = (r: WriteResult): RestoreOutcome | null => {
    if (r === "ok") return "live";
    if (r === "parked" || r === "cancelled") return r;
    if (r === "network" || r === "aborted") return fail(showRestoreFailedToast);
    return null;
  };
  try {
    // The store first, then the flag (S1): the first frame is decided from
    // what is actually stored, never assumed.
    await loadDeviceLocation(w.athleteId);
    setGoLiveDisplay(restoreFirstFrame(w.athleteId, hint));
    // Flag off: the plain write, as always (drawn live meanwhile). A flag
    // read that does not answer in time goes by the hint, and the server
    // decides: a `location_required` refusal means the ladder after all.
    if (!(await boundedFlagRead(hint))) {
      setGoLiveDisplay("restore-live");
      const r = await writeLive(a, w, w.canWrite);
      if (r !== "refused") {
        outcome = fromWrite(r) ?? fail(showRestoreFailedToast);
        return outcome;
      }
      markMatchLocationRequired(true);
    }
    // A backend without the ladder: the old restore (a silent fresh reading,
    // no write without permission, otherwise the write).
    if (getPresenceCapability() === "legacy") {
      setGoLiveDisplay("hold");
      if ((await silentGoLiveReading()) === "permission") {
        setNeedsLocation(true);
        outcome = fail(showLocationOffGoLiveCta);
        return outcome;
      }
      outcome = fromWrite(await writeLive(a, w, w.canWrite)) ?? fail(showRestoreFailedToast);
      return outcome;
    }

    const entry = validDeviceTag(w.athleteId);
    const stored = validDeviceReading(w.athleteId);
    const perm = await permissionState();
    if (entry || stored) a.flip();
    else if (perm.granted) setGoLiveDisplay("restore-finding");
    else setGoLiveDisplay("hold");

    const stopped = (r: ReplayResult): RestoreOutcome | null => {
      if (r.kind === "live") return "live";
      if (r.kind === "parked" || r.kind === "cancelled") return r.kind;
      if (r.kind === "network" || r.kind === "aborted") return fail(showRestoreFailedToast);
      return null;
    };

    if (entry) {
      const r = await writeLive(a, w, w.canWrite);
      if (r !== "refused") {
        outcome = fromWrite(r) ?? fail(showRestoreFailedToast);
        return outcome;
      }
    }
    for (const [cand, clear] of [
      [entry, clearDeviceTag],
      [stored, clearDeviceReading],
    ] as const) {
      if (!cand || getPresenceCapability() === "legacy") continue;
      const r = await replay(a, w, tagOf(cand), w.canWrite);
      if (r.kind === "next") clear(w.athleteId);
      const s = stopped(r);
      if (s) return (outcome = s);
    }
    let osLooked = false;
    if (perm.granted && getPresenceCapability() !== "legacy") {
      const os = await readOsCachedFix(TAG_WINDOW_MS, OS_CACHE_BUDGET_MS, perm.coarse === true);
      osLooked = true;
      if (os) {
        const s = stopped(await replay(a, w, os, w.canWrite));
        if (s) return (outcome = s);
      }
    }
    if (!perm.granted) {
      // No tag the server would accept and no way to take one without asking.
      setGoLiveDisplay("hold");
      setNeedsLocation(true);
      outcome = fail(showLocationOffGoLiveCta);
      return outcome;
    }
    // Rung 4, silently: permission is already granted, so nothing asks.
    const c = w.canWrite();
    if (c !== "ok") return (outcome = c);
    a.finding();
    const fresh: ReadOutcome = await silentFreshFix({
      skipLastKnown: osLooked,
      reporter: freshReporter(a, w.athleteId),
    });
    if (fresh.kind === "ok") {
      outcome = fromWrite(await writeLive(a, w, w.canWrite)) ?? fail(showRestoreFailedToast);
      return outcome;
    }
    if (fresh.kind === "denied") {
      setNeedsLocation(true);
      return (outcome = fail(showLocationOffGoLiveCta));
    }
    if (fresh.kind === "error") return (outcome = fail(showRestoreFailedToast));
    return (outcome = fail(showLocationFixFailedGoLiveCta));
  } finally {
    a.dispose();
    setRestoreInFlight(false);
    if (outcome === "live") {
      setNeedsLocation(false);
      // Kept until the store says live, so no GO LIVE frame slips between.
      clearGoLiveDisplayWhenLive();
    } else {
      setGoLiveDisplay(null);
    }
  }
}

/** Tests only. */
export function __resetLocationLadderForTests(): void {
  unreportedFix = null;
}
