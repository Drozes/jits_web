/**
 * One fresh foreground location reading for the invite proximity check
 * (contract 6: `Accuracy.High`, 10 s timeout). Never throws. This module
 * stores nothing; a reading the server ACCEPTS may be kept on the device by
 * the caller as the athlete's last location (instant go-live 4.1,
 * `lib/location/device-location-store.ts`), never a refused one.
 *
 * `fast` (Go Live and the face-off re-poll, live location fixes 4.2): a last
 * known position under 60 s old and 100 m or better is used as is (it is a
 * real, recent position, so the server's movement rule still holds);
 * otherwise `Accuracy.Balanced`, and `Accuracy.High` only when Balanced is
 * worse than 100 m, all inside the same 10 s budget. `skipLastKnown`: the
 * location ladder already looked at the OS cache (rung 3), so go straight to
 * a live fix.
 *
 * Every `ok` result carries `capturedAt`, the fix's own timestamp (ms epoch).
 */
import { Platform } from "react-native";
import * as Location from "expo-location";
import type { LocationReading } from "@jits/shared/api/invites";
import { takeDevFix } from "@/lib/arena/dev-go-live-hooks";

export type ReadingResult =
  | {
      status: "ok";
      reading: LocationReading;
      /** When the fix was taken (the OS timestamp, ms epoch; callers fall back to now). */
      capturedAt?: number;
      /**
       * Reduced precision: iOS Precise Location off (heuristic, a reading of
       * 1000 m or worse) or Android approximate location only. The server
       * would refuse the reading as too coarse, and "try near a window" is
       * the wrong advice.
       */
      reducedPrecision?: boolean;
    }
  /** `canAskAgain`: the system prompt can still be shown (never asked yet, or an iOS Allow Once grant lapsed). */
  | { status: "denied"; canAskAgain: boolean }
  /** `reason`: `timeout` (no fix in 10 s, or the permission prompt hung 30 s), `error` (services off, a fix error). */
  | { status: "unavailable"; reason?: "timeout" | "error" };

export const READING_TIMEOUT_MS = 10_000;
/** The system permission prompt never answering (live location fixes 1e). */
export const PERMISSION_REQUEST_TIMEOUT_MS = 30_000;
/** The fast path's acceptance rules for a last known position (4.2). */
export const LAST_KNOWN_MAX_AGE_MS = 60_000;
export const GOOD_ACCURACY_M = 100;
/** iOS readings this coarse mean Precise Location is off (3a). */
export const REDUCED_PRECISION_ACCURACY_M = 1000;

const TIMED_OUT = Symbol("timed-out");

/**
 * System permission prompts in flight. On Android the runtime permission
 * dialog pauses the activity, so AppState reports "background" (then
 * "active") while it is up; iOS reports "inactive". Owners that treat a
 * background as "the athlete left" (the Go Live flow, the challenger's
 * one-time ask) ignore transitions while this is set.
 */
let permissionRequests = 0;

export function permissionRequestInFlight(): boolean {
  return permissionRequests > 0;
}

/**
 * `start()`, or `TIMED_OUT` after `ms`. Lazy: with no time left the work is
 * never started (so it cannot reject unobserved). The race observes the
 * work's rejection, and the timer never outlives the race.
 */
async function within<T>(start: () => Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  if (ms <= 0) return TIMED_OUT;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      start(),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function accuracyOf(p: Location.LocationObject): number | null {
  const a = p.coords.accuracy;
  return typeof a === "number" && Number.isFinite(a) && a > 0 ? a : null;
}

/** A last known position the fast path may report (4.2). */
export function acceptLastKnown(p: Location.LocationObject | null, now: number): boolean {
  if (!p) return false;
  const a = accuracyOf(p);
  const age = now - p.timestamp;
  return a !== null && a <= GOOD_ACCURACY_M && Number.isFinite(age) && age >= 0 && age < LAST_KNOWN_MAX_AGE_MS;
}

function toResult(p: Location.LocationObject, coarsePermission: boolean): ReadingResult {
  const raw = accuracyOf(p);
  const reducedPrecision =
    coarsePermission || (Platform.OS === "ios" && raw !== null && raw >= REDUCED_PRECISION_ACCURACY_M);
  const ts = typeof p.timestamp === "number" && Number.isFinite(p.timestamp) ? p.timestamp : Date.now();
  return {
    status: "ok",
    // Never later than now: a fix stamped in the future is a clock quirk.
    capturedAt: Math.min(ts, Date.now()),
    reading: {
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      // A missing accuracy is treated as too coarse; the server answers accuracy_too_low.
      accuracyM: raw ?? 1000,
    },
    ...(reducedPrecision ? { reducedPrecision: true } : {}),
  };
}

/** Last known, then Balanced, then High; all inside one 10 s budget. */
async function fastFix(skipLastKnown = false): Promise<Location.LocationObject | "timeout" | "error"> {
  const deadline = Date.now() + READING_TIMEOUT_MS;
  const left = () => deadline - Date.now();
  if (!skipLastKnown) {
    try {
      const last = await within(
        () => Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS, requiredAccuracy: GOOD_ACCURACY_M }),
        left(),
      );
      if (last !== TIMED_OUT && last && acceptLastKnown(last, Date.now())) return last;
    } catch {
      // No last known position: take a live fix.
    }
  }
  let balanced: Location.LocationObject | null = null;
  let failed = false;
  try {
    const b = await within(() => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), left());
    if (b === TIMED_OUT) return "timeout";
    balanced = b;
    const a = accuracyOf(b);
    if (a !== null && a <= GOOD_ACCURACY_M) return b;
  } catch {
    failed = true;
  }
  try {
    // `within` never starts the fix once the budget is spent.
    const h = await within(() => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), left());
    if (h !== TIMED_OUT) {
      // The better of the two (a High fix can come back coarser indoors).
      const ha = accuracyOf(h);
      const ba = balanced ? accuracyOf(balanced) : null;
      return balanced && ba !== null && (ha === null || ba < ha) ? balanced : h;
    }
  } catch {
    failed = true;
  }
  if (balanced) return balanced;
  return failed ? "error" : "timeout";
}

export async function readLocationOnce(
  opts: { ask: boolean; fast?: boolean; skipLastKnown?: boolean } = { ask: true },
): Promise<ReadingResult> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    let granted = current.granted;
    let canAskAgain = current.canAskAgain;
    let coarse = current.android?.accuracy === "coarse";
    if (!granted && opts.ask && canAskAgain) {
      permissionRequests += 1;
      let asked: Awaited<ReturnType<typeof Location.requestForegroundPermissionsAsync>> | typeof TIMED_OUT;
      try {
        asked = await within(() => Location.requestForegroundPermissionsAsync(), PERMISSION_REQUEST_TIMEOUT_MS);
      } finally {
        permissionRequests -= 1;
      }
      if (asked === TIMED_OUT) return { status: "unavailable", reason: "timeout" };
      granted = asked.granted;
      canAskAgain = asked.canAskAgain;
      coarse = asked.android?.accuracy === "coarse";
    }
    if (!granted) return { status: "denied", canAskAgain: Boolean(canAskAgain) };
    // DEV ONLY (QA): a forced timeout or accuracy for this fix; null in production.
    const devFix = takeDevFix();
    if (devFix?.kind === "timeout") return { status: "unavailable", reason: "timeout" };
    const patch = (p: Location.LocationObject): Location.LocationObject =>
      devFix?.kind === "accuracy" ? { ...p, coords: { ...p.coords, accuracy: devFix.accuracyM } } : p;
    if (opts.fast) {
      const fix = await fastFix(opts.skipLastKnown === true);
      if (fix === "timeout" || fix === "error") return { status: "unavailable", reason: fix };
      return toResult(patch(fix), coarse);
    }
    const position = await within(
      () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      READING_TIMEOUT_MS,
    );
    if (position === TIMED_OUT) return { status: "unavailable", reason: "timeout" };
    return toResult(patch(position), coarse);
  } catch {
    return { status: "unavailable", reason: "error" };
  }
}

/**
 * The OS cached fix for the location ladder's rung 3 (instant go-live 4.2):
 * `getLastKnownPositionAsync` with a 4 hour (minus margin) max age and
 * 100 m, accepted only when its own timestamp and accuracy pass the same
 * checks (the OS may ignore the options) and it is not reduced precision.
 * Only with permission ALREADY granted (the caller checks; this never asks).
 * Bounded by `budgetMs`; null when absent, too old, too coarse or late.
 */
export async function readOsCachedFix(
  maxAgeMs: number,
  budgetMs: number,
  coarsePermission = false,
): Promise<{ reading: LocationReading; capturedAt: number } | null> {
  if (coarsePermission) return null;
  try {
    const last = await within(
      () => Location.getLastKnownPositionAsync({ maxAge: maxAgeMs, requiredAccuracy: GOOD_ACCURACY_M }),
      budgetMs,
    );
    if (last === TIMED_OUT || !last) return null;
    const a = accuracyOf(last);
    const now = Date.now();
    const age = now - last.timestamp;
    if (a === null || a > GOOD_ACCURACY_M) return null;
    if (!Number.isFinite(age) || age < 0 || age >= maxAgeMs) return null;
    return {
      reading: { lat: last.coords.latitude, lng: last.coords.longitude, accuracyM: a },
      capturedAt: last.timestamp,
    };
  } catch {
    return null;
  }
}
