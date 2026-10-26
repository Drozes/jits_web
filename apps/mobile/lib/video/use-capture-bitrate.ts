/**
 * The capture bitrate for the viewfinder (dynamic capture bitrate, spec 7.5,
 * jits-n2im.33): read the inputs once per face-off, decide with the pure
 * picker (`capture-bitrate.ts`), and freeze the decision together with the
 * capture quality.
 *
 * Mirrors `use-capture-quality.ts` on purpose: the same `active` (the
 * face-off of a viewer who records) starts the reads, the same `locked` (the
 * live step, or a clip recording or stopping) freezes the answer. On iOS the
 * codec and bitrate are read at record start, so a decision may still land
 * up to the lock.
 *
 * Android is held earlier, from the first render with the camera up: a new
 * `videoBitrate` prop recreates the CameraX camera asynchronously (unbinding
 * the use cases), and a `recordAsync` racing that teardown loses the clip.
 * So a decision that has not landed by the time the camera mounts is never
 * applied for that face-off (`pending`, today's recording). The one
 * exception is a quality change (the 1080p flag answer), which recreates the
 * camera anyway: the decision follows it in that same render, so the
 * bitrate always matches the quality's ladder and never sits below its floor.
 *
 * Every input fails on its own to a safe value: NetInfo to null (weak
 * level), the history to [] (the class default), the codec list to null
 * (today's recording on iOS), the kill switch to the last value read
 * (persisted across launches; default: feature on).
 */
import * as React from "react";
import { Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MatchVideoCaptureQuality } from "@jits/shared/api/match-video-upload";
import { getFeatureFlag } from "@jits/shared/api/location";
import { supabase } from "@/lib/supabase/client";
import {
  CAPTURE_BITRATE_OFF_FLAG,
  CAPTURE_FLAG_TIMEOUT_MS,
  CAPTURE_NETWORK_TIMEOUT_MS,
  pickCaptureBitrate,
  unmanagedDecision,
  type CaptureBitrateDecision,
  type CaptureNetworkSnapshot,
  type ThroughputSample,
} from "./capture-bitrate";
import { loadThroughputHistory } from "./capture-bitrate-history";
import { cachedCaptureCodecs, ensureCaptureCodecs } from "./capture-codecs";

/** Where the last kill switch answer is kept across launches (D9). */
export const CAPTURE_BITRATE_OFF_KEY = "elo-capture-bitrate-off::v1";

/**
 * The kill switch as last read (D9). Persisted, so a relaunch re-entry into
 * a live match (which reads nothing, D6) still honours a switch an admin
 * flipped before the relaunch. Never read on this install (or not primed yet
 * when the re-entry renders): feature on, as a missing row reads, since the
 * weak level is itself the safe, fast choice.
 */
let lastKnownOff = false;
/** A network answer landed in this process; the disk value is older. */
let readThisProcess = false;

/** The kill switch as last read, synchronously (re-entry cannot wait for a read). */
export function lastKnownCaptureBitrateOff(): boolean {
  return lastKnownOff;
}

/** Load the persisted answer (no network). Called once at app start; never throws. */
export async function primeCaptureBitrateOff(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CAPTURE_BITRATE_OFF_KEY);
    const parsed = raw ? (JSON.parse(raw) as { off?: unknown } | null) : null;
    if (!readThisProcess && typeof parsed?.off === "boolean") lastKnownOff = parsed.off;
  } catch {
    /* default: feature on */
  }
}

/**
 * One read of `match_capture_bitrate_off`, bounded by `CAPTURE_FLAG_TIMEOUT_MS`
 * so a slow answer can never hold the face-off's decision back; a failed or
 * slow read keeps the last value. Never throws.
 */
export async function readCaptureBitrateOff(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CAPTURE_FLAG_TIMEOUT_MS);
    });
    const res = await Promise.race([getFeatureFlag(supabase, CAPTURE_BITRATE_OFF_FLAG), timeout]);
    if (res?.ok) {
      lastKnownOff = res.data;
      readThisProcess = true;
      AsyncStorage.setItem(CAPTURE_BITRATE_OFF_KEY, JSON.stringify({ off: res.data })).catch(() => undefined);
    }
  } catch {
    /* keep the last value read */
  } finally {
    if (timer) clearTimeout(timer);
  }
  return lastKnownOff;
}

/** NetInfo once, within `CAPTURE_NETWORK_TIMEOUT_MS`; null on a throw or the timeout. */
export async function readCaptureNetwork(): Promise<CaptureNetworkSnapshot | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CAPTURE_NETWORK_TIMEOUT_MS);
    });
    const state = await Promise.race([NetInfo.fetch(), timeout]);
    if (!state) return null;
    const details = state.details as { cellularGeneration?: unknown } | null | undefined;
    return {
      type: typeof state.type === "string" ? state.type : null,
      cellularGeneration: typeof details?.cellularGeneration === "string" ? details.cellularGeneration : null,
      isInternetReachable: typeof state.isInternetReachable === "boolean" ? state.isInternetReachable : null,
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface CaptureInputs {
  disabled: boolean;
  codecs: readonly string[] | null;
  network: CaptureNetworkSnapshot | null;
  history: readonly ThroughputSample[];
  /** When the inputs landed: the history window is measured from here. */
  now: number;
}

async function readCaptureInputs(): Promise<CaptureInputs> {
  const [network, history, codecs, disabled] = await Promise.all([
    readCaptureNetwork().catch(() => null),
    loadThroughputHistory().catch((): ThroughputSample[] => []),
    ensureCaptureCodecs().catch(() => null),
    readCaptureBitrateOff().catch(() => lastKnownOff),
  ]);
  return { network, history, codecs, disabled, now: Date.now() };
}

/** The decision for a relaunch re-entry (D6): computed synchronously, nothing read. */
function reentryDecision(quality: MatchVideoCaptureQuality): CaptureBitrateDecision {
  return pickCaptureBitrate({
    platform: Platform.OS,
    quality,
    disabled: lastKnownOff,
    reentry: true,
    codecs: cachedCaptureCodecs(),
    network: null,
    history: [],
    now: Date.now(),
  });
}

/**
 * The viewfinder's capture bitrate decision. `pending` (today's recording)
 * until the inputs land; then the picker's answer, following `quality` until
 * the first locked render after the face-off became active, whose decision
 * is returned unchanged from then on. On Android it is also held from the
 * first render with the camera up (see the module doc). First active while
 * already locked is a relaunch re-entry: the weak level, decided on that very
 * render (Android needs the prop there), with no reads.
 */
export function useCaptureBitrate({
  active,
  locked,
  quality,
  cameraUp,
}: {
  active: boolean;
  locked: boolean;
  quality: MatchVideoCaptureQuality;
  /** The `CameraView` is rendered (mounted and permission granted). */
  cameraUp: boolean;
}): CaptureBitrateDecision {
  const [inputs, setInputs] = React.useState<CaptureInputs | null>(null);
  // Latched in the commit, before any answer can land after it.
  const lockedRef = React.useRef(locked);
  React.useLayoutEffect(() => {
    if (locked) lockedRef.current = true;
  }, [locked]);
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Written during render on purpose (spec 7.5): the re-entry decision and
  // the frozen one must exist on the render that first needs them, before
  // any commit. Both writes are idempotent for a given render's inputs, so a
  // discarded render only recomputes the same value.
  const seenActiveRef = React.useRef(false);
  const reentryRef = React.useRef<CaptureBitrateDecision | null>(null);
  if (active && !seenActiveRef.current) {
    seenActiveRef.current = true;
    if (locked || lockedRef.current) reentryRef.current = reentryDecision(quality);
  }

  const askedRef = React.useRef(false);
  React.useEffect(() => {
    if (!active || askedRef.current) return;
    askedRef.current = true;
    if (lockedRef.current || reentryRef.current) return;
    void readCaptureInputs().then((next) => {
      if (!mountedRef.current || lockedRef.current) return;
      setInputs(next);
    });
  }, [active]);

  const live = React.useMemo(
    () =>
      inputs
        ? pickCaptureBitrate({ ...inputs, quality, platform: Platform.OS, reentry: false })
        : unmanagedDecision(quality, "pending"),
    [inputs, quality],
  );

  const frozenRef = React.useRef<CaptureBitrateDecision | null>(null);
  const heldRef = React.useRef<CaptureBitrateDecision | null>(null);
  if (frozenRef.current) return frozenRef.current;
  let decision = reentryRef.current ?? live;
  if (Platform.OS !== "ios" && !reentryRef.current && (cameraUp || heldRef.current)) {
    // Held from the render the camera mounts in (that render's value is the
    // prop it mounts with, so it costs nothing); replaced only together
    // with a quality change, which recreates the camera anyway.
    if (!heldRef.current || heldRef.current.quality !== quality) heldRef.current = decision;
    decision = heldRef.current;
  }
  // Frozen only once the face-off has been active, so a viewfinder whose
  // opt-in settles a render after the lock still takes the re-entry path.
  if (locked && seenActiveRef.current) frozenRef.current = decision;
  return decision;
}

/** Test-only reset of the module state. */
export function __resetCaptureBitrateHookForTests(): void {
  lastKnownOff = false;
  readThisProcess = false;
}
