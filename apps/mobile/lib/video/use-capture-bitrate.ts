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
 *
 * Phase 2 (spec 16.7): the inputs and the background network probe live in
 * the per-match capture prep (`capture-prep.ts`), keyed by `prepKey` (the
 * match id). The hook starts it on the first active render, reads it
 * synchronously (so a prep the timekeeper's sheet already ran is used on
 * the very first render), stops the probe at the lock (no probe ever runs
 * during a recording) and releases it on unmount. A probe that lands before
 * the hold (Android) or the lock (iOS) decides the level; one that lands
 * later changes nothing for this face-off. The match never waits on it.
 */
import * as React from "react";
import { Platform } from "react-native";
import type { MatchVideoCaptureQuality } from "@jits/shared/api/match-video-upload";
import { pickCaptureBitrate, unmanagedDecision, type CaptureBitrateDecision } from "./capture-bitrate";
import { cachedCaptureCodecs } from "./capture-codecs";
import { __resetCaptureInputsForTests, lastKnownCaptureBitrateOff } from "./capture-inputs";
import {
  getCapturePrepSnapshot,
  releaseCapturePrep,
  startCapturePrep,
  stopCapturePrepProbe,
  subscribeCapturePrep,
} from "./capture-prep";

export {
  CAPTURE_BITRATE_OFF_KEY,
  lastKnownCaptureBitrateOff,
  primeCaptureBitrateOff,
  readCaptureBitrateOff,
  readCaptureNetwork,
  readCaptureProbeOff,
} from "./capture-inputs";

/** The decision for a relaunch re-entry (D6): computed synchronously, nothing read. */
function reentryDecision(quality: MatchVideoCaptureQuality): CaptureBitrateDecision {
  const decision = pickCaptureBitrate({
    platform: Platform.OS,
    quality,
    disabled: lastKnownCaptureBitrateOff(),
    reentry: true,
    codecs: cachedCaptureCodecs(),
    network: null,
    history: [],
    location: null,
    probe: null,
    now: Date.now(),
  });
  return { ...decision, probeOutcome: "reentry" };
}

let practiceKeys = 0;

/** How long a handed-off prep's viewfinder may stay inactive before its probe is stopped. */
export const CAPTURE_PREP_INACTIVE_STOP_MS = 2_000;

function noop(): void {}

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
  prepKey = null,
}: {
  active: boolean;
  locked: boolean;
  quality: MatchVideoCaptureQuality;
  /** The `CameraView` is rendered (mounted and permission granted). */
  cameraUp: boolean;
  /** The match id (the capture prep's key); null for practice, which never probes. */
  prepKey?: string | null;
}): CaptureBitrateDecision {
  const practiceKeyRef = React.useRef<string | null>(null);
  if (prepKey === null && practiceKeyRef.current === null) practiceKeyRef.current = `practice:${++practiceKeys}`;
  const key = prepKey ?? (practiceKeyRef.current as string);

  // Latched in the commit, before any answer can land after it.
  const lockedRef = React.useRef(locked);
  React.useLayoutEffect(() => {
    if (locked) lockedRef.current = true;
  }, [locked]);

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

  // A re-entry reads nothing (D6), so it never subscribes to a prep either.
  const subscribe = React.useCallback(
    (cb: () => void) => (reentryRef.current ? noop : subscribeCapturePrep(key, cb)),
    [key],
  );
  const getSnapshot = React.useCallback(
    () => (reentryRef.current ? null : getCapturePrepSnapshot(key)),
    [key],
  );
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Started on the first active render that is not a re-entry and not
  // locked yet; idempotent per key, so the timekeeper sheet's prep is
  // claimed as it is and a later active render reads nothing again.
  // Released (aborting a running probe) only on unmount, by which time the
  // decision is frozen or no longer used.
  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (!active || reentryRef.current) return;
    if (!startedRef.current) {
      if (lockedRef.current) return;
      startedRef.current = true;
    }
    startCapturePrep(key, { matchId: prepKey });
  }, [active, key, prepKey]);
  React.useEffect(() => () => releaseCapturePrep(key), [key]);

  // A prep someone else started (the timekeeper sheet's, handed off) for a
  // viewfinder that does not record would still spend the probe's data.
  // Stopped once the viewfinder has stayed inactive for a grace period, so
  // a timekeeper whose opt-in settles a little late (the match roles and
  // consent loading) still gets it. A prep this hook starts is never
  // affected: it only exists once the hook was active.
  const handedOffRef = React.useRef<boolean | null>(null);
  if (handedOffRef.current === null) handedOffRef.current = prepKey !== null && getCapturePrepSnapshot(key) !== null;
  React.useEffect(() => {
    if (active || !handedOffRef.current || startedRef.current) return;
    const timer = setTimeout(() => stopCapturePrepProbe(key), CAPTURE_PREP_INACTIVE_STOP_MS);
    return () => clearTimeout(timer);
  }, [active, key]);

  // No probe ever runs during a recording: stopped at the lock.
  React.useLayoutEffect(() => {
    if (locked) stopCapturePrepProbe(key);
  }, [locked, key]);

  const live = React.useMemo(() => {
    if (!snapshot?.inputs) return { ...unmanagedDecision(quality, "pending"), probeOutcome: "pending" } as CaptureBitrateDecision;
    const decided = pickCaptureBitrate({
      ...snapshot.inputs,
      probe: snapshot.probe,
      quality,
      platform: Platform.OS,
      reentry: false,
      // The decision's clock is now, not when the inputs landed: a probe's
      // age (CAPTURE_PROBE_MAX_AGE_MS) is measured when it is used.
      now: Math.max(snapshot.inputs.now, Date.now()),
    });
    // The picker's word on a landed probe (applied, stale, ignored) wins;
    // otherwise the prep's state (pending, failed, off, ...).
    const probeOutcome =
      decided.probeOutcome !== "not_needed" ? decided.probeOutcome : snapshot.probe ? "ignored" : snapshot.probeOutcome;
    return { ...decided, probeOutcome } as CaptureBitrateDecision;
  }, [snapshot, quality]);

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
  __resetCaptureInputsForTests();
}
