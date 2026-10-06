import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, Platform } from "react-native";

/**
 * The keep-watching angle switch engine (jits-xfvd.19, contract
 * research/2026-10-multi-angle-playback/07-keep-watching-contract.md):
 * the single player's two slot players, fake timers (Date.now moves with
 * them), and the shared fake expo-video.
 *
 * Every test opens vid-1 playing at 10 s with vid-2 and vid-3 pre-signed,
 * then taps with offsets (0 / 0 unless said), so map(tA) = tA and an exact
 * landing is checkable to the millisecond.
 */

const mockTelemetry = {
  setMeta: jest.fn(),
  sourceAttached: jest.fn(),
  resigned: jest.fn(),
  playIntent: jest.fn(),
  seekRequested: jest.fn(),
  signOutcome: jest.fn(),
  expectWait: jest.fn(),
  firstFrame: jest.fn(),
  switchStarted: jest.fn(),
  switchLanded: jest.fn(),
  switchHeldStill: jest.fn(),
  switchPillShown: jest.fn(),
  switchFailed: jest.fn(),
  switchSuperseded: jest.fn(),
  switchKeepWatchingLanded: jest.fn(),
  switchRetarget: jest.fn(),
  switchFallback: jest.fn(),
  switchAbandoned: jest.fn(),
  switchLoadRetried: jest.fn(),
  switchTapIgnored: jest.fn(),
  error: jest.fn(),
  setQuality: jest.fn(),
  renditionAttached: jest.fn(),
  qualitySwitchStarted: jest.fn(),
  qualitySwitchLanded: jest.fn(),
  onStall: jest.fn(() => () => undefined),
};
jest.mock("@/lib/video/use-playback-telemetry", () => ({
  usePlaybackTelemetry: () => mockTelemetry,
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockSign = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchVideoPlaybackResult: (...a: unknown[]) => mockSign(...a),
}));

/** The OTA constants a test flips (read live through the module's getters). */
const mockFlags = { audioRamp: true, enabled: true };
jest.mock("@/lib/match-detail/keep-watching", () => {
  const actual = jest.requireActual("@/lib/match-detail/keep-watching");
  const mod: Record<string, unknown> = { ...actual };
  Object.defineProperty(mod, "AUDIO_RAMP", { get: () => mockFlags.audioRamp, enumerable: true });
  Object.defineProperty(mod, "KEEP_WATCHING_ENABLED", { get: () => mockFlags.enabled, enumerable: true });
  return mod;
});

/** The device the tier is read from (full unless a test says warm-only). */
const mockDevice: { info: { os: string; apiLevel: number | null; totalMemory: number | null; yearClass: number | null } } = {
  info: { os: "ios", apiLevel: null, totalMemory: null, yearClass: null },
};
jest.mock("@/lib/video/multi-angle/device-tier", () => ({
  ...jest.requireActual("@/lib/video/multi-angle/device-tier"),
  readDeviceInfo: () => mockDevice.info,
}));

jest.mock("expo-video", () => require("../../support/fake-expo-video"));
import {
  deferReplace,
  emitStatus,
  failReplace,
  fakePlayers as mockPlayers,
  readyPlayer,
  resetFakeVideo,
  tick,
} from "../../support/fake-expo-video";

import { ABANDON_TIMEOUT_MS, CROSSFADE_MS, DIP_MS, INCOMING_FORWARD_BUFFER_S, KEEP_WATCHING_CAP_MS, READY_FALLBACK_MS } from "@/lib/match-detail/keep-watching";
import { __resetSwitchLeadStoreForTests, keepWatchingUnsupported, markKeepWatchingUnsupported } from "@/lib/match-detail/switch-lead-store";
import { PAUSED_LAND_FALLBACK_MS, SWITCH_SETTLE_MS, useVideoPlayback } from "@/lib/match-detail/use-video-playback";
import { __resetNetworkStoreForTests } from "@/lib/video/quality/network-store";

type Playback = ReturnType<typeof useVideoPlayback>;
type Result = { current: Playback };

const URLS: Record<string, string> = { "vid-1": "https://s/a.mp4", "vid-2": "https://s/b.mp4", "vid-3": "https://s/c.mp4" };
function playable(url: string, extra: Record<string, unknown> = {}) {
  return { ok: true, data: { url, posterUrl: null, status: "ready", playability: "playable", matchId: "m", durationSeconds: 400, sourceKind: "normalized", ...extra } };
}
function signAll(overrides: Record<string, () => Promise<unknown>> = {}) {
  mockSign.mockImplementation((_c: unknown, vid: string) =>
    overrides[vid] ? overrides[vid]() : Promise.resolve(playable(URLS[vid] ?? "https://s/x.mp4")),
  );
}

/** Player index of slot `i` of the latest hook instance. */
const idx = (i: 0 | 1) => mockPlayers.length - 2 + i;
const slot = (i: 0 | 1) => mockPlayers[idx(i)];
const OFFSETS = { fromMs: 0, toMs: 0 };
const flush = async () => {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
};
const state = (r: Result) => r.current.switchState;

let tapAt = 0;
/**
 * The modelled A clock: `base` at `at`, moving at `rate` while `playing`.
 * After a tap, `advance` sends A a time update every 100 ms (as the pending
 * 0.1 s interval does), so the engine never extrapolates A far (review L1).
 */
const aClock = { base: 10, at: 0, rate: 1, playing: true, ticking: true };
const aNow = (rate = aClock.rate) => (aClock.playing ? aClock.base + ((Date.now() - aClock.at) / 1000) * rate : aClock.base);
/** A's clock jumps (a user seek) or stops (pause, end), from now. */
const setAClock = (patch: Partial<typeof aClock>) => {
  Object.assign(aClock, { base: aNow(), at: Date.now() }, patch);
};
const advance = async (ms: number) => {
  let left = ms;
  do {
    const step = Math.min(100, left);
    act(() => {
      jest.advanceTimersByTime(step);
    });
    if (tapAt > 0 && aClock.playing && aClock.ticking) act(() => tick(idx(0), aNow()));
    left -= step;
  } while (left > 0);
  await flush();
};

/** Open vid-1, ready, a frame on screen, playing at 10 s; vid-2 and vid-3 pre-signed. */
async function open(opts: { paused?: boolean; rate?: number } = {}) {
  const hook = renderHook(({ id }: { id: string }) => useVideoPlayback(id), { initialProps: { id: "vid-1" } });
  await waitFor(() => expect(slot(0).replaceAsync).toHaveBeenCalledTimes(1));
  await flush();
  act(() => readyPlayer(idx(0)));
  act(() => hook.result.current.onSlotFirstFrame(0));
  act(() => tick(idx(0), 10));
  act(() => hook.result.current.presign(["vid-2", "vid-3"]));
  await waitFor(() => expect(mockSign).toHaveBeenCalledWith({}, "vid-3", expect.anything()));
  await flush();
  if (opts.rate) {
    act(() => hook.result.current.setRate(opts.rate!));
    aClock.rate = opts.rate;
  }
  if (opts.paused) aClock.playing = false;
  if (opts.paused) act(() => hook.result.current.toggle());
  for (const p of [slot(0), slot(1)]) {
    p.play.mockClear();
    p.pause.mockClear();
    p.intervals.length = 0;
    p.mutes.length = 0;
    p.volumes.length = 0;
    p.seeks.length = 0;
  }
  return hook;
}

/** Tap `target` with A at exactly 10 s now. */
function tap(result: Result, target = "vid-2", opts: { approximate?: boolean; offsets?: { fromMs: number | null; toMs: number | null } } = {}) {
  act(() => tick(idx(0), 10));
  tapAt = Date.now();
  Object.assign(aClock, { base: 10, at: tapAt });
  act(() => result.current.switchAngle(target, 10, { offsets: OFFSETS, ...opts }));
}

/** B settled, seeked to t0 and ready; returns t0. */
async function bReady(): Promise<number> {
  await flush();
  const t0 = slot(1).seeks.at(-1)!;
  act(() => readyPlayer(idx(1)));
  return t0;
}

/** Play the scheduled start, then feed B in step with A until it lands (or `samples` run out). */
async function chaseInStep(result: Result, opts: { errorS?: number; samples?: number; rate?: number } = {}) {
  const rate = opts.rate ?? 1;
  const t0 = slot(1).seeks.at(-1)!;
  // The scheduled play() fires a start latency before A reaches t0.
  const waitMs = ((t0 - aNow(rate)) / rate) * 1000 - 120;
  await advance(Math.max(0, Math.ceil(waitMs)));
  expect(slot(1).play).toHaveBeenCalled();
  for (let i = 0; i < (opts.samples ?? 2) && state(result).phase === "pending"; i++) {
    await advance(i === 0 ? 220 : 100);
    act(() => tick(idx(1), aNow(rate) + (opts.errorS ?? 0)));
  }
}

let appStateHandlers: Array<(s: string) => void> = [];
/** Every AppState listener, in subscription order (the engine's layout-effect one first). */
const appStateHandler = (s: string) => appStateHandlers.forEach((h) => h(s));
beforeEach(() => {
  tapAt = 0;
  Object.assign(aClock, { base: 10, at: 0, rate: 1, playing: true, ticking: true });
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetFakeVideo();
  __resetSwitchLeadStoreForTests();
  __resetNetworkStoreForTests({ type: "wifi", isConnected: true, details: null });
  mockFlags.audioRamp = true;
  mockFlags.enabled = true;
  mockDevice.info = { os: "ios", apiLevel: null, totalMemory: null, yearClass: null };
  signAll();
  appStateHandlers = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_e, fn) => {
    appStateHandlers.push(fn as (s: string) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("keep-watching switch: playing", () => {
  it("starts on the other slot: A keeps playing; B loads muted with a 5 s forward buffer at t0 = A + lead", async () => {
    const { result } = await open();
    tap(result);
    expect(state(result)).toMatchObject({
      phase: "pending",
      seq: 1,
      mode: "keep_watching",
      fromSlot: 0,
      incomingSlot: 1,
      targetId: "vid-2",
      fromId: "vid-1",
      heldFrame: null,
      leadMs: 1000,
    });
    expect(mockTelemetry.switchStarted).toHaveBeenCalledWith("keep_watching");
    expect(mockTelemetry.switchFallback).not.toHaveBeenCalled();
    // The pre-signed URL: no sign round trip.
    expect(slot(1).replaceAsync).toHaveBeenCalledWith({ uri: "https://s/b.mp4" });
    expect(slot(1).muted).toBe(true);
    expect(slot(1).bufferWrites.at(-1)?.preferredForwardBufferDuration).toBe(INCOMING_FORWARD_BUFFER_S);
    // A: untouched, D1: the chrome stays on A.
    expect(slot(0).pause).not.toHaveBeenCalled();
    expect(slot(0).mutes).toEqual([]);
    expect(slot(0).replaceAsync).toHaveBeenCalledTimes(1);
    expect(result.current.activeId).toBe("vid-1");
    expect(result.current.frontSlot).toBe(0);
    expect(result.current.player).toBe(slot(0));
    expect(slot(0).intervals.at(-1)).toBe(0.1);
    expect(slot(1).intervals.at(-1)).toBe(0.1);
    await flush();
    // At the settle: paused, seeked to 10 + 1.0 s lead.
    expect(slot(1).seeks).toEqual([11]);
    expect(slot(1).play).not.toHaveBeenCalled();
  });

  it("lands in step: the role swap, the chips and chrome flip at LAND, an equal-power ramp, release 300 ms later", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    await chaseInStep(result);
    expect(state(result)).toMatchObject({ phase: "landing", mode: "keep_watching", fromSlot: 0, incomingSlot: 1 });
    expect(state(result).landedAt).toBe(Date.now());
    expect(result.current.activeId).toBe("vid-2");
    expect(result.current.frontSlot).toBe(1);
    expect(result.current.player).toBe(slot(1));
    expect(result.current.source?.url).toBe("https://s/b.mp4");
    expect(result.current.positionS).toBeCloseTo(aNow());
    expect(result.current.frameShown).toBe(true);
    expect(mockTelemetry.switchLanded).toHaveBeenCalledTimes(1);
    expect(mockTelemetry.switchKeepWatchingLanded).toHaveBeenCalledWith({
      leadMs: 1000,
      landedLateMs: Math.round((aNow() - 10) * 1000),
      syncErrorMs: 0,
      exact: true,
      afterRetry: false,
    });
    // A was never paused or muted before LAND; B was muted until LAND.
    expect(slot(0).pause).not.toHaveBeenCalled();
    expect(slot(0).mutes).toEqual([]);
    expect(slot(1).mutes).toEqual([true, false]);
    // The ramp: B from 0 up, A down, 6 steps of 40 ms (cos / sin).
    expect(slot(1).volumes).toEqual([1, 0]);
    for (let k = 1; k <= 6; k++) {
      await advance(CROSSFADE_MS / 6);
      expect(slot(0).volumes.at(k === 6 ? -2 : -1)).toBeCloseTo(Math.cos((k / 6) * (Math.PI / 2)));
      expect(slot(1).volumes.at(-1)).toBeCloseTo(Math.sin((k / 6) * (Math.PI / 2)));
    }
    expect(slot(0).muted).toBe(true);
    expect(slot(0).volume).toBe(1);
    // No bytes re-requested for B, and the front never reloads it.
    expect(slot(1).replaceAsync).toHaveBeenCalledTimes(1);
    expect(slot(1).bufferWrites.at(-1)?.preferredForwardBufferDuration).toBe(0);
    // Idle 300 ms after LAND: the old front is released; the lock opens.
    await advance(SWITCH_SETTLE_MS - CROSSFADE_MS - 1);
    expect(state(result).phase).toBe("landing");
    expect(slot(0).releases).toBe(0);
    await advance(1);
    expect(state(result)).toMatchObject({ phase: "idle", fromSlot: null, incomingSlot: null, mode: "keep_watching" });
    expect(slot(0).releases).toBe(1);
    expect(slot(0).pause).toHaveBeenCalled();
    expect(slot(0).playbackRate).toBe(1);
    expect(slot(1).muted).toBe(false);
    expect(slot(1).volume).toBe(1);
    expect(slot(0).intervals.at(-1)).toBe(0.25);
    expect(slot(1).intervals.at(-1)).toBe(0.25);
  });

  it("the new front is fully the player: time updates, seek and play/pause act on B; A's late events are ignored", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    await chaseInStep(result);
    await advance(SWITCH_SETTLE_MS);
    act(() => tick(idx(1), 15));
    expect(result.current.positionS).toBe(15);
    act(() => tick(idx(0), 99));
    expect(result.current.positionS).toBe(15);
    act(() => result.current.seek(30));
    expect(slot(1).seeks.at(-1)).toBe(30);
    act(() => result.current.toggle());
    expect(slot(1).pause).toHaveBeenCalled();
    // A second switch now loads into slot 0.
    act(() => tick(idx(1), 30));
    act(() => result.current.switchAngle("vid-3", 30, { offsets: OFFSETS }));
    expect(state(result)).toMatchObject({ phase: "pending", seq: 2, fromSlot: 1, incomingSlot: 0 });
    expect(slot(0).replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/c.mp4" });
  });

  it("an approximate angle lands once B started at t0 (no sync check), audio cut at the dip's bottom", async () => {
    const { result } = await open();
    tap(result, "vid-2", { approximate: true });
    await bReady();
    await chaseInStep(result, { errorS: 0.3, samples: 1 });
    expect(state(result)).toMatchObject({ phase: "landing", approximate: true });
    expect(mockTelemetry.switchKeepWatchingLanded).toHaveBeenCalledWith(expect.objectContaining({ exact: false }));
    expect(slot(1).muted).toBe(true);
    await advance(DIP_MS);
    expect(slot(0).muted).toBe(true);
    expect(slot(1).muted).toBe(false);
    expect(slot(1).volume).toBe(1);
  });

  it("unknown offsets: approximate, mapped one to one", async () => {
    const { result } = await open();
    tap(result, "vid-2", { offsets: { fromMs: null, toMs: 500 } });
    await flush();
    expect(slot(1).seeks).toEqual([11]);
    await bReady();
    await chaseInStep(result, { errorS: 0.3, samples: 1 });
    expect(state(result).phase).toBe("landing");
  });

  it("the ramp kill switch (AUDIO_RAMP false) cuts at the crossfade midpoint", async () => {
    mockFlags.audioRamp = false;
    const { result } = await open();
    tap(result);
    await bReady();
    await chaseInStep(result);
    expect(state(result).phase).toBe("landing");
    expect(slot(1).muted).toBe(true);
    await advance(CROSSFADE_MS / 2 - 1);
    expect(slot(0).muted).toBe(false);
    await advance(1);
    expect(slot(0).muted).toBe(true);
    expect(slot(1).muted).toBe(false);
    expect(slot(1).volume).toBe(1);
    expect(slot(0).volumes).toEqual([]);
  });

  it("B starting at a different moment than A (sync offsets) is chased on B's own clock", async () => {
    const { result } = await open();
    // B started 2 s after A: A 10 s is B 8 s; t0 = 9.
    tap(result, "vid-2", { offsets: { fromMs: 0, toMs: 2000 } });
    await flush();
    expect(slot(1).seeks).toEqual([9]);
    act(() => readyPlayer(idx(1)));
    await advance(880);
    expect(slot(1).play).toHaveBeenCalledTimes(1);
    await advance(220);
    act(() => tick(idx(1), aNow() - 2));
    await advance(100);
    act(() => tick(idx(1), aNow() - 2));
    expect(state(result).phase).toBe("landing");
    expect(mockTelemetry.switchKeepWatchingLanded).toHaveBeenCalledWith(expect.objectContaining({ syncErrorMs: 0, exact: true }));
  });

  it("B does not cover the moment: lands at its edge as soon as it is ready, normal crossfade (not approximate)", async () => {
    const { result } = await open();
    // B started 60 s after A.
    tap(result, "vid-2", { offsets: { fromMs: 0, toMs: 60000 } });
    await flush();
    expect(slot(1).seeks).toEqual([0]);
    act(() => readyPlayer(idx(1)));
    // Coordinator decision: approximate drives the "not synced" copy, so it stays false.
    expect(state(result)).toMatchObject({ phase: "landing", approximate: false });
    expect(slot(1).play).toHaveBeenCalled();
    // No sync error is reported for a moment B does not have.
    expect(mockTelemetry.switchKeepWatchingLanded).toHaveBeenCalledWith(expect.objectContaining({ exact: false }));
    // The equal-power ramp, as for an exact landing.
    expect(slot(1).volumes).toEqual([1, 0]);
    await advance(CROSSFADE_MS);
    expect(slot(0).muted).toBe(true);
    expect(slot(1).volume).toBeCloseTo(1);
  });

  it("a hidden chase: a nudge for a mid error, a hard re-seek for a big one (counted as a retarget)", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    await chaseInStep(result, { errorS: 0.09, samples: 1 });
    expect(state(result).phase).toBe("pending");
    expect(slot(1).playbackRate).toBeLessThan(1);
    await advance(100);
    act(() => tick(idx(1), aNow() + 0.5));
    // The median of the samples so far passed the hidden threshold.
    expect(mockTelemetry.switchRetarget).toHaveBeenCalledTimes(1);
    expect(slot(1).seeks.at(-1)).toBeCloseTo(aNow() + 0.12);
    // Settling after the re-seek: samples are not judged.
    await advance(100);
    act(() => tick(idx(1), aNow() + 0.5));
    expect(mockTelemetry.switchRetarget).toHaveBeenCalledTimes(1);
    // Settled after the re-seek and in step: lands at the session rate.
    await advance(800);
    act(() => tick(idx(1), aNow()));
    await advance(100);
    act(() => tick(idx(1), aNow()));
    expect(state(result).phase).toBe("landing");
    expect(slot(1).playbackRate).toBe(1);
  });

  it("[cap] lands at the cap with the leftover offset when B never gets within 2 frames", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    await chaseInStep(result, { errorS: 0.1, samples: 1 });
    for (let i = 0; i < 40 && state(result).phase === "pending"; i++) {
      await advance(100);
      act(() => tick(idx(1), aNow() + 0.1));
    }
    expect(state(result).phase).toBe("landing");
    expect(Date.now() - tapAt).toBeGreaterThanOrEqual(KEEP_WATCHING_CAP_MS.fast);
    expect(Date.now() - tapAt).toBeLessThan(KEEP_WATCHING_CAP_MS.fast + 150);
    expect(mockTelemetry.switchKeepWatchingLanded).toHaveBeenCalledWith(expect.objectContaining({ syncErrorMs: 100, exact: true }));
    expect(mockTelemetry.switchAbandoned).not.toHaveBeenCalled();
  });

  it("[cap] the cap timer lands a started B even with no new sample", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    await chaseInStep(result, { errorS: 0.1, samples: 1 });
    await advance(KEEP_WATCHING_CAP_MS.fast - (Date.now() - tapAt));
    expect(state(result).phase).toBe("landing");
  });

  it("B not started by the cap keeps waiting under A, then is abandoned at the timeout", async () => {
    const { result } = await open();
    deferReplace(idx(1)); // B never settles
    tap(result);
    await advance(KEEP_WATCHING_CAP_MS.fast);
    expect(state(result).phase).toBe("pending");
    await advance(ABANDON_TIMEOUT_MS.fast - KEEP_WATCHING_CAP_MS.fast - 1);
    expect(state(result).phase).toBe("pending");
    await advance(1);
    expect(state(result)).toMatchObject({ phase: "idle", failed: { seq: 1, targetId: "vid-2" } });
    expect(mockTelemetry.switchAbandoned).toHaveBeenCalledWith("timeout");
  });

  it("late ready: retargets ahead by what the load took (counted); the ready item's start is still planned (M2)", async () => {
    const { result } = await open();
    tap(result);
    await flush();
    // Ready 900 ms later: A is within a start latency of t0 = 11.
    await advance(900);
    act(() => readyPlayer(idx(1)));
    expect(mockTelemetry.switchRetarget).toHaveBeenCalledTimes(1);
    const t1 = slot(1).seeks.at(-1)!;
    expect(t1).toBeCloseTo(aNow() + 1.3 * 0.9 + 0.2);
    // The re-seeked item is already ready: play is scheduled a start latency before A reaches t1.
    const startMs = Math.round((t1 - aNow()) * 1000 - 120);
    await advance(startMs - 10);
    expect(slot(1).play).not.toHaveBeenCalled();
    await advance(20);
    expect(slot(1).play).toHaveBeenCalledTimes(1);
    expect(t1 - aNow()).toBeCloseTo(0.12, 1);
    expect(mockTelemetry.switchRetarget).toHaveBeenCalledTimes(1);
  });

  it("M2: a re-seek of a ready B with no new ready event: the fallback plans the start, never plays at once", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    // B drops back to loading (it does not report ready again), then a user seek.
    act(() => emitStatus(idx(1), "loading"));
    act(() => result.current.seek(100));
    setAClock({ base: 100 });
    expect(slot(1).seeks.at(-1)).toBe(101);
    await advance(READY_FALLBACK_MS - 10);
    expect(slot(1).play).not.toHaveBeenCalled();
    await advance(10);
    // At the fallback A is at the old target: a planned retarget ahead, not play() 1 s off.
    expect(slot(1).play).not.toHaveBeenCalled();
    expect(mockTelemetry.switchRetarget).toHaveBeenCalledTimes(1);
    expect(slot(1).seeks.at(-1)! - aNow()).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it("M2: a user seek on a ready B starts it on plan and lands in step at the new moment", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    act(() => result.current.seek(100));
    tapAt = Date.now();
    setAClock({ base: 100, at: tapAt });
    expect(slot(1).seeks.at(-1)).toBe(101);
    await chaseInStep(result);
    expect(state(result).phase).toBe("landing");
    expect(result.current.positionS).toBeCloseTo(aNow());
    expect(mockTelemetry.switchRetarget).not.toHaveBeenCalled();
  });

  it("the ready fallback plays B muted at once when no ready event comes (iOS paused buffer)", async () => {
    const { result } = await open();
    tap(result);
    await flush();
    await advance(READY_FALLBACK_MS - 1);
    expect(slot(1).play).not.toHaveBeenCalled();
    await advance(1);
    expect(slot(1).play).toHaveBeenCalledTimes(1);
    expect(slot(1).muted).toBe(true);
    expect(state(result).phase).toBe("pending");
  });

  it("no quality decision is applied while a keep-watching switch is in flight", async () => {
    const { result } = await open();
    tap(result);
    // The lock condition the controller reads (contract 07 section 6).
    expect(state(result).phase).not.toBe("idle");
    expect(mockTelemetry.qualitySwitchStarted).not.toHaveBeenCalled();
  });
});

describe("keep-watching switch: paused, rate, seek, end (3.4, 3.5)", () => {
  it("paused: exact target, lands on B's first frame after the seek; both stay paused", async () => {
    const { result } = await open({ paused: true });
    mockTelemetry.firstFrame.mockClear();
    tap(result);
    expect(state(result).leadMs).toBe(0);
    await flush();
    expect(slot(1).seeks).toEqual([10]);
    // A frame before the settle seek would not count; this one is after it.
    act(() => result.current.onSlotFirstFrame(1));
    expect(state(result).phase).toBe("landing");
    expect(slot(1).play).not.toHaveBeenCalled();
    expect(slot(0).play).not.toHaveBeenCalled();
    expect(result.current.activeId).toBe("vid-2");
    expect(mockTelemetry.firstFrame).not.toHaveBeenCalled();
  });

  it("paused: lands 350 ms after the post-seek readyToPlay when B has drawn a frame", async () => {
    const { result } = await open({ paused: true });
    const swap = deferReplace(idx(1));
    tap(result);
    // A frame of B before the seek: not a landing, but B's view has a picture.
    act(() => result.current.onSlotFirstFrame(1));
    await act(async () => swap.resolve());
    await flush();
    act(() => readyPlayer(idx(1)));
    await advance(PAUSED_LAND_FALLBACK_MS - 1);
    expect(state(result).phase).toBe("pending");
    await advance(1);
    expect(state(result).phase).toBe("landing");
    expect(result.current.frameShown).toBe(true);
  });

  it("paused: with no frame of B yet, the 350 ms fallback waits up to READY_FALLBACK_MS more for one", async () => {
    const { result } = await open({ paused: true });
    tap(result);
    await flush();
    act(() => readyPlayer(idx(1)));
    await advance(PAUSED_LAND_FALLBACK_MS);
    expect(state(result).phase).toBe("pending");
    await advance(READY_FALLBACK_MS - 1);
    expect(state(result).phase).toBe("pending");
    await advance(1);
    expect(state(result).phase).toBe("landing");
  });

  it("m4: at LAND currentTimeNow, positionS, durationS, source and activeId describe B in the same commit", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    act(() => readyPlayer(idx(1)));
    let seen: { id?: string; now: number } | null = null;
    await chaseInStep(result);
    seen = { id: result.current.activeId, now: result.current.currentTimeNow() };
    expect(seen.id).toBe("vid-2");
    expect(seen.now).toBe(slot(1).currentTime);
    expect(result.current.durationS).toBe(400);
    expect(result.current.source?.url).toBe("https://s/b.mp4");
  });

  it("a frame of B before its seek never lands it", async () => {
    const { result } = await open({ paused: true });
    deferReplace(idx(1));
    tap(result);
    act(() => result.current.onSlotFirstFrame(1));
    expect(state(result).phase).toBe("pending");
  });

  it("pause while pending: B pauses (no scheduled play) and re-seeks exactly to A's paused moment", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    await advance(300);
    act(() => tick(idx(0), 10.3));
    setAClock({ base: 10.3, playing: false });
    act(() => result.current.toggle());
    expect(slot(1).pause).toHaveBeenCalled();
    expect(slot(1).seeks.at(-1)).toBeCloseTo(10.3);
    await advance(2000);
    // The scheduled play never fires; the ready item lands paused on its post-seek fallback.
    expect(slot(1).play).not.toHaveBeenCalled();
    expect(mockTelemetry.switchLanded).toHaveBeenCalledTimes(1);
    expect(result.current.activeId).toBe("vid-2");
    expect(result.current.positionS).toBeCloseTo(10.3);
    expect(slot(0).pause).toHaveBeenCalled();
  });

  it("play while paused-pending: re-seeks the loaded B ahead by the lead (no reload) and lands in step", async () => {
    const { result } = await open({ paused: true });
    tap(result);
    await flush();
    act(() => result.current.toggle());
    expect(slot(1).replaceAsync).toHaveBeenCalledTimes(1);
    expect(slot(1).seeks.at(-1)).toBe(11);
    tapAt = Date.now();
    setAClock({ base: 10, at: tapAt, playing: true });
    act(() => readyPlayer(idx(1)));
    await chaseInStep(result);
    expect(state(result).phase).toBe("landing");
  });

  it("rate change before B starts: re-seeks with the new media lead; after it starts: B's rate follows", async () => {
    const { result } = await open();
    tap(result);
    await flush();
    act(() => result.current.setRate(2));
    expect(slot(1).seeks.at(-1)).toBe(12);
    act(() => readyPlayer(idx(1)));
    // 2 s of media in 1 s of wall time: play 120 ms before.
    await advance(880);
    expect(slot(1).play).toHaveBeenCalledTimes(1);
    expect(slot(1).playbackRate).toBe(2);
    act(() => result.current.setRate(0.5));
    expect(slot(1).playbackRate).toBe(0.5);
    expect(mockTelemetry.switchRetarget).not.toHaveBeenCalled();
  });

  it("slow motion lands in step at the session rate", async () => {
    const { result } = await open({ rate: 0.5 });
    tap(result);
    await flush();
    expect(slot(1).seeks.at(-1)).toBe(10.5);
    act(() => readyPlayer(idx(1)));
    await chaseInStep(result, { rate: 0.5 });
    expect(state(result).phase).toBe("landing");
    expect(slot(1).playbackRate).toBe(0.5);
  });

  it("a user seek while pending retargets B from the seek target (retargets reset, not counted)", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    act(() => result.current.seek(100));
    expect(slot(0).seeks.at(-1)).toBe(100);
    expect(slot(1).seeks.at(-1)).toBe(101);
    expect(slot(1).pause).toHaveBeenCalled();
    expect(mockTelemetry.switchRetarget).not.toHaveBeenCalled();
    expect(state(result).phase).toBe("pending");
  });

  it("A reaching its end while pending continues as paused at A's end", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    act(() => tick(idx(0), 399.9));
    setAClock({ base: 399.9, playing: false });
    act(() => slot(0).emit("playToEnd"));
    expect(result.current.playing).toBe(false);
    expect(slot(1).seeks.at(-1)).toBeCloseTo(399.5);
    // Ready already: the paused fallback, then one more wait for a frame.
    await advance(2 * READY_FALLBACK_MS);
    expect(mockTelemetry.switchLanded).toHaveBeenCalledTimes(1);
    expect(result.current.positionS).toBeCloseTo(399.5);
  });
});

describe("keep-watching switch: the lock", () => {
  it("[lock] switchAngle while pending or landing is a no-op (state, telemetry and players untouched)", async () => {
    const { result } = await open();
    tap(result);
    const pending = state(result);
    act(() => result.current.switchAngle("vid-3", 10, { offsets: OFFSETS }));
    act(() => result.current.switchAngle("vid-3", 10));
    expect(state(result)).toBe(pending);
    expect(mockTelemetry.switchStarted).toHaveBeenCalledTimes(1);
    expect(mockTelemetry.switchSuperseded).not.toHaveBeenCalled();
    expect(mockTelemetry.switchFallback).not.toHaveBeenCalled();
    await bReady();
    await chaseInStep(result);
    const landing = state(result);
    expect(landing.phase).toBe("landing");
    act(() => result.current.switchAngle("vid-3", 11, { offsets: OFFSETS }));
    expect(state(result)).toBe(landing);
    expect(slot(0).replaceAsync).toHaveBeenCalledTimes(1);
    await advance(SWITCH_SETTLE_MS);
    act(() => result.current.switchAngle("vid-3", 11, { offsets: OFFSETS }));
    expect(state(result)).toMatchObject({ phase: "pending", seq: 2 });
  });

  it("[lock] screen taps ignored by the lock are counted through switchTapIgnored", async () => {
    const { result } = await open();
    act(() => result.current.telemetry.switchTapIgnored());
    expect(mockTelemetry.switchTapIgnored).toHaveBeenCalledTimes(1);
  });
});

describe("keep-watching switch: abandon (section 7)", () => {
  function expectAbandoned(result: Result, reason: string, failure: boolean) {
    expect(state(result)).toMatchObject({ phase: "idle", fromSlot: null, incomingSlot: null });
    if (failure) expect(state(result).failed).toMatchObject({ seq: 1, targetId: "vid-2" });
    else expect(state(result).failed).toBeNull();
    expect(mockTelemetry.switchAbandoned).toHaveBeenCalledWith(reason);
    expect(mockTelemetry.switchFailed).toHaveBeenCalledTimes(failure ? 1 : 0);
    // The incoming player is torn down; A plays on (activeId never moved).
    expect(slot(1).releases).toBe(1);
    expect(slot(1).muted).toBe(true);
    expect(slot(1).volume).toBe(1);
    expect(result.current.activeId).toBe("vid-1");
    expect(result.current.frontSlot).toBe(0);
    expect(slot(0).replaceAsync).toHaveBeenCalledTimes(1);
    expect(slot(0).intervals.at(-1)).toBe(0.25);
    expect(slot(1).intervals.at(-1)).toBe(0.25);
  }

  it("sign_failed: the target's sign fails", async () => {
    signAll({ "vid-9": () => Promise.resolve({ ok: false, error: { code: "UNKNOWN", message: "x" } }) });
    const { result } = await open();
    tap(result, "vid-9");
    await flush();
    expect(state(result)).toMatchObject({ phase: "idle", failed: { targetId: "vid-9" } });
    expect(mockTelemetry.switchAbandoned).toHaveBeenCalledWith("sign_failed");
    expect(mockTelemetry.switchFailed).toHaveBeenCalledTimes(1);
    expect(slot(0).pause).not.toHaveBeenCalled();
  });

  it("sign_failed: a thrown sign", async () => {
    signAll({ "vid-9": () => Promise.reject(new Error("offline")) });
    const { result } = await open();
    tap(result, "vid-9");
    await flush();
    expect(mockTelemetry.switchAbandoned).toHaveBeenCalledWith("sign_failed");
  });

  it.each([
    ["fast", { type: "wifi", isConnected: true, details: null }],
    ["cellular", { type: "cellular", isConnected: true, details: { cellularGeneration: "4g" } }],
    ["slow", { type: "cellular", isConnected: true, details: { cellularGeneration: "3g" } }],
  ] as const)("timeout per network class (%s)", async (cls, net) => {
    __resetNetworkStoreForTests(net);
    const { result } = await open();
    deferReplace(idx(1));
    tap(result);
    await advance(ABANDON_TIMEOUT_MS[cls] - 1);
    expect(state(result).phase).toBe("pending");
    await advance(1);
    expectAbandoned(result, "timeout", true);
  });

  it("background: abandoned silently; A shows paused as today", async () => {
    const { result } = await open();
    tap(result);
    await flush();
    act(() => appStateHandler("background"));
    expectAbandoned(result, "background", false);
    expect(result.current.playing).toBe(false);
  });

  it("background during landing: the landing finishes first (role swap, A released)", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    await chaseInStep(result);
    act(() => appStateHandler("background"));
    expect(state(result).phase).toBe("idle");
    expect(result.current.frontSlot).toBe(1);
    expect(slot(0).releases).toBe(1);
    expect(mockTelemetry.switchAbandoned).not.toHaveBeenCalled();
  });

  it("navigation: an outside navigation abandons silently, then loads the new recording on the front", async () => {
    const hook = renderHook(({ id }: { id: string }) => useVideoPlayback(id), { initialProps: { id: "vid-1" } });
    await waitFor(() => expect(slot(0).replaceAsync).toHaveBeenCalledTimes(1));
    await flush();
    act(() => readyPlayer(idx(0)));
    act(() => hook.result.current.onSlotFirstFrame(0));
    tap(hook.result);
    await flush();
    hook.rerender({ id: "vid-7" });
    await flush();
    expect(mockTelemetry.switchAbandoned).toHaveBeenCalledWith("navigation");
    expect(state(hook.result)).toMatchObject({ phase: "idle", failed: null });
    expect(slot(1).releases).toBe(1);
    expect(slot(0).replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/x.mp4" });
  });

  it("unmount: abandoned with no state update; its timers never fire", async () => {
    const { result, unmount } = await open();
    tap(result);
    await flush();
    unmount();
    expect(mockTelemetry.switchAbandoned).toHaveBeenCalledWith("unmount");
    expect(mockTelemetry.switchFailed).not.toHaveBeenCalled();
    // No timeout, cap or play timer of the switch survives the unmount.
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(mockTelemetry.switchAbandoned).toHaveBeenCalledTimes(1);
    expect(slot(1).play).not.toHaveBeenCalled();
  });

  it("front_error: A errors while pending; abandoned (no tag), then today's silent re-sign of A", async () => {
    const { result } = await open();
    tap(result);
    await flush();
    act(() => emitStatus(idx(0), "error", "expired"));
    expectAbandonedLoose(result, "front_error");
    expect(mockTelemetry.resigned).toHaveBeenCalledTimes(1);
  });

  function expectAbandonedLoose(result: Result, reason: string) {
    expect(state(result)).toMatchObject({ phase: "idle", failed: null });
    expect(mockTelemetry.switchAbandoned).toHaveBeenCalledWith(reason);
    expect(slot(1).releases).toBe(1);
  }

  it("load_error after the one retry; a status error before LAND counts like a rejected swap", async () => {
    const { result } = await open();
    failReplace(idx(1), "network lost");
    tap(result);
    await flush();
    expect(mockTelemetry.switchLoadRetried).toHaveBeenCalledTimes(1);
    expect(state(result).phase).toBe("pending");
    // The retry settled; now B reports an error.
    act(() => emitStatus(idx(1), "error", "network lost again"));
    expectAbandoned(result, "load_error", true);
  });
});

describe("keep-watching switch: the one silent retry (7.1)", () => {
  it("[retry] first load error: one retry of the cached URL, no tag, chips still locked; the landing counts it", async () => {
    const { result } = await open();
    failReplace(idx(1), "network lost");
    tap(result);
    const signs = mockSign.mock.calls.length;
    await flush();
    expect(mockTelemetry.switchLoadRetried).toHaveBeenCalledTimes(1);
    expect(mockTelemetry.switchFailed).not.toHaveBeenCalled();
    expect(state(result)).toMatchObject({ phase: "pending", failed: null });
    // Not re-signed (fresh URL, no auth error): the same URL again.
    expect(mockSign).toHaveBeenCalledTimes(signs);
    expect(slot(1).replaceAsync).toHaveBeenCalledTimes(2);
    expect(slot(1).replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/b.mp4" });
    act(() => result.current.switchAngle("vid-3", 10, { offsets: OFFSETS }));
    expect(state(result).targetId).toBe("vid-2");
    await bReady();
    await chaseInStep(result);
    expect(state(result).phase).toBe("landing");
    expect(mockTelemetry.switchKeepWatchingLanded).toHaveBeenCalledWith(expect.objectContaining({ afterRetry: true }));
  });

  it("[retry] an auth or expiry error re-signs", async () => {
    const { result } = await open();
    failReplace(idx(1), "HTTP 403");
    tap(result);
    const signs = mockSign.mock.calls.length;
    await flush();
    expect(mockSign).toHaveBeenCalledTimes(signs + 1);
    expect(mockSign).toHaveBeenLastCalledWith({}, "vid-2", { rendition: "720" });
    expect(slot(1).replaceAsync).toHaveBeenCalledTimes(2);
  });

  it("[retry] a URL signed more than 30 min ago re-signs", async () => {
    const { result } = await open();
    await advance(31 * 60 * 1000);
    failReplace(idx(1), "network lost");
    tap(result);
    const signs = mockSign.mock.calls.length;
    await flush();
    expect(mockSign).toHaveBeenCalledTimes(signs + 1);
  });

  it("[retry] t0 is recomputed from A's position at the retry", async () => {
    const { result } = await open();
    const first = deferReplace(idx(1));
    tap(result);
    await advance(2000);
    act(() => tick(idx(0), 12));
    await act(async () => first.reject(new Error("network lost")));
    await flush();
    // A at 12 now, lead 1 s.
    expect(slot(1).seeks.at(-1)).toBe(13);
  });

  it("[retry] a late event of the failed generation is ignored", async () => {
    const { result } = await open();
    failReplace(idx(1), "network lost");
    const second = deferReplace(idx(1));
    tap(result);
    await flush();
    expect(slot(1).replaceAsync).toHaveBeenCalledTimes(2);
    // The failed item reports again while the retry's swap is in flight.
    act(() => emitStatus(idx(1), "error", "late"));
    expect(state(result).phase).toBe("pending");
    expect(mockTelemetry.switchAbandoned).not.toHaveBeenCalled();
    await act(async () => second.resolve());
    await flush();
    expect(slot(1).seeks.at(-1)).toBe(11);
  });

  it("[retry] a second load error abandons with load_error", async () => {
    const { result } = await open();
    failReplace(idx(1), "network lost");
    failReplace(idx(1), "network lost");
    tap(result);
    await flush();
    expect(mockTelemetry.switchLoadRetried).toHaveBeenCalledTimes(1);
    expect(mockTelemetry.switchAbandoned).toHaveBeenCalledWith("load_error");
    expect(state(result)).toMatchObject({ phase: "idle", failed: { targetId: "vid-2" } });
  });

  it("[retry] a sign failure on the retry abandons with sign_failed", async () => {
    const { result } = await open();
    signAll({ "vid-2": () => Promise.resolve({ ok: false, error: { code: "UNKNOWN", message: "x" } }) });
    failReplace(idx(1), "403 expired");
    tap(result);
    await flush();
    expect(mockTelemetry.switchLoadRetried).toHaveBeenCalledTimes(1);
    expect(mockTelemetry.switchAbandoned).toHaveBeenCalledWith("sign_failed");
  });

  it("[retry] the deadline is not reset: an error at 7.5 s on fast still abandons at 8 s", async () => {
    const { result } = await open();
    const first = deferReplace(idx(1));
    deferReplace(idx(1)); // the retry never settles
    tap(result);
    await advance(7500);
    await act(async () => first.reject(new Error("network lost")));
    await flush();
    expect(mockTelemetry.switchLoadRetried).toHaveBeenCalledTimes(1);
    await advance(ABANDON_TIMEOUT_MS.fast - 7500 - 1);
    expect(state(result).phase).toBe("pending");
    await advance(1);
    expect(mockTelemetry.switchAbandoned).toHaveBeenCalledWith("timeout");
  });

  it("D7: an Android decoder error skips the retry, abandons, and latches later switches in place", async () => {
    const { result } = await open();
    const first = deferReplace(idx(1));
    tap(result);
    const os = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    try {
      await act(async () => first.reject(new Error("MediaCodec init failed")));
      await flush();
    } finally {
      Object.defineProperty(Platform, "OS", { value: os, configurable: true });
    }
    expect(mockTelemetry.switchLoadRetried).not.toHaveBeenCalled();
    expect(mockTelemetry.switchAbandoned).toHaveBeenCalledWith("decoder_error");
    expect(state(result)).toMatchObject({ phase: "idle", failed: { targetId: "vid-2" } });
    expect(keepWatchingUnsupported()).toBe(true);
    act(() => result.current.switchAngle("vid-3", 10, { offsets: OFFSETS }));
    expect(state(result).mode).toBe("in_place");
    expect(mockTelemetry.switchFallback).toHaveBeenCalledWith("unsupported");
  });
});

describe("keep-watching switch: in_place fallbacks (section 9)", () => {
  async function expectInPlace(result: Result, reason: string | null) {
    expect(state(result)).toMatchObject({ phase: "pending", mode: "in_place", fromSlot: null, incomingSlot: null });
    expect(mockTelemetry.switchStarted).toHaveBeenCalledWith("seek");
    if (reason) expect(mockTelemetry.switchFallback).toHaveBeenCalledWith(reason);
    // Phase 1: the target goes into the front player; slot 1 stays empty.
    expect(slot(1).replaceAsync).not.toHaveBeenCalled();
  }

  it("disabled: KEEP_WATCHING_ENABLED false restores phase 1", async () => {
    mockFlags.enabled = false;
    const { result } = await open();
    tap(result);
    await expectInPlace(result, "disabled");
  });

  it("unsupported: the decoder latch", async () => {
    markKeepWatchingUnsupported();
    const { result } = await open();
    tap(result);
    await expectInPlace(result, "unsupported");
  });

  it("warm_only: a warm-only Android tier", async () => {
    mockDevice.info = { os: "android", apiLevel: 28, totalMemory: 3 * 1024 ** 3, yearClass: 2018 };
    const { result } = await open();
    tap(result);
    await expectInPlace(result, "warm_only");
  });

  it("no_offsets: the caller passed no offsets", async () => {
    const { result } = await open();
    act(() => result.current.switchAngle("vid-2", 10));
    await expectInPlace(result, "no_offsets");
  });

  it("front_not_ready: no frame of A on screen yet", async () => {
    const hook = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(slot(0).replaceAsync).toHaveBeenCalledTimes(1));
    await flush();
    act(() => hook.result.current.switchAngle("vid-2", 0, { offsets: OFFSETS }));
    await expectInPlace(hook.result, "front_not_ready");
  });

  it("phase_not_ready: the first sign is still out", async () => {
    signAll({ "vid-1": () => new Promise(() => undefined) });
    const hook = renderHook(() => useVideoPlayback("vid-1"));
    await flush();
    act(() => hook.result.current.switchAngle("vid-2", 0, { offsets: OFFSETS }));
    expect(mockTelemetry.switchFallback).toHaveBeenCalledWith("phase_not_ready");
    expect(slot(1).replaceAsync).not.toHaveBeenCalled();
  });
});

describe("keep-watching switch: review round 1 (jits-xfvd.19)", () => {
  const SHORT = () => signAll({ "vid-4": () => Promise.resolve(playable("https://s/d.mp4", { durationSeconds: 12.5 })) });

  it("M1: a late retarget past a shorter angle's end lands at its edge once ready there", async () => {
    SHORT();
    const { result } = await open();
    tap(result, "vid-4");
    await flush();
    expect(slot(1).seeks).toEqual([11]);
    await advance(900);
    act(() => readyPlayer(idx(1), 12.5));
    // max(1, 1.3 * 0.9 + 0.2) ahead of 10.9 is past 12.0 (12.5 - 0.5): clamped, not covered.
    expect(mockTelemetry.switchRetarget).toHaveBeenCalledTimes(1);
    expect(slot(1).seeks.at(-1)).toBe(12);
    expect(state(result)).toMatchObject({ phase: "landing", approximate: false });
    expect(result.current.activeId).toBe("vid-4");
    expect(mockTelemetry.switchKeepWatchingLanded).toHaveBeenCalledWith(expect.objectContaining({ exact: false }));
  });

  it("M1: a hidden re-seek past B's end is clamped and lands at the edge", async () => {
    SHORT();
    const { result } = await open();
    tap(result, "vid-4");
    await flush();
    act(() => readyPlayer(idx(1), 12.5));
    await chaseInStep(result, { errorS: -0.5, samples: 1 });
    for (let i = 0; i < 40 && state(result).phase === "pending"; i++) {
      await advance(100);
      act(() => tick(idx(1), aNow() - 0.5));
    }
    expect(state(result).phase).toBe("landing");
    expect(slot(1).seeks.at(-1)).toBe(12);
    expect(slot(1).seeks.every((t) => t <= 12)).toBe(true);
    expect(mockTelemetry.switchRetarget).toHaveBeenCalled();
    expect(mockTelemetry.switchAbandoned).not.toHaveBeenCalled();
  });

  it("M1: B reaching its end while pending lands at the edge (crossfade, not approximate) and stops", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    await chaseInStep(result, { errorS: 0.09, samples: 1 });
    expect(state(result).phase).toBe("pending");
    act(() => slot(1).emit("playToEnd"));
    expect(state(result)).toMatchObject({ phase: "landing", approximate: false });
    expect(result.current.activeId).toBe("vid-2");
    expect(result.current.playing).toBe(false);
    // Stopped at the end: the outgoing angle is silenced at once (no ramp over a stopped film).
    expect(slot(0).muted).toBe(true);
    expect(slot(1).muted).toBe(false);
  });

  it("L1: a stalled A (no time updates) is not extrapolated past 250 ms: no false late retarget", async () => {
    const { result } = await open();
    tap(result);
    aClock.ticking = false;
    await flush();
    await advance(900);
    act(() => readyPlayer(idx(1)));
    // A's last update is the tap at 10 s: at most 10.25 now, so t0 = 11 is still ahead.
    expect(mockTelemetry.switchRetarget).not.toHaveBeenCalled();
    await advance(620);
    expect(slot(1).play).not.toHaveBeenCalled();
    await advance(20);
    expect(slot(1).play).toHaveBeenCalledTimes(1);
  });

  it("L4: a pause during the landing pauses and silences the outgoing angle at once", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    await chaseInStep(result);
    expect(state(result).phase).toBe("landing");
    await advance(40);
    const writes = slot(0).volumes.length;
    act(() => result.current.toggle());
    expect(slot(0).pause).toHaveBeenCalled();
    expect(slot(0).muted).toBe(true);
    expect(slot(1).pause).toHaveBeenCalled();
    expect(slot(1).muted).toBe(false);
    expect(slot(1).volume).toBe(1);
    await advance(200);
    // The ramp stopped: no more volume writes to the old front.
    expect(slot(0).volumes.length).toBe(writes + 1);
  });

  it("L4: a seek during the landing silences the outgoing angle; the seek acts on B", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    await chaseInStep(result);
    act(() => result.current.seek(50));
    expect(slot(1).seeks.at(-1)).toBe(50);
    expect(slot(0).seeks).not.toContain(50);
    expect(slot(0).muted).toBe(true);
    expect(slot(0).pause).toHaveBeenCalled();
  });

  it("L5: a median in step does not land while the latest raw sample is out of step", async () => {
    const { result } = await open();
    tap(result);
    await bReady();
    await chaseInStep(result, { errorS: 0.06, samples: 1 });
    expect(state(result).phase).toBe("pending");
    await advance(100);
    act(() => tick(idx(1), aNow() - 0.3));
    expect(state(result).phase).toBe("pending");
    await advance(100);
    act(() => tick(idx(1), aNow()));
    await advance(100);
    act(() => tick(idx(1), aNow()));
    expect(state(result).phase).toBe("landing");
  });

  it("m4: distinct durations: at LAND the clock, duration, source and id are B's in the same commit", async () => {
    signAll({ "vid-2": () => Promise.resolve(playable(URLS["vid-2"], { durationSeconds: 300 })) });
    const { result } = await open();
    expect(result.current.durationS).toBe(400);
    tap(result);
    await flush();
    act(() => readyPlayer(idx(1), 300));
    await chaseInStep(result);
    expect(state(result).phase).toBe("landing");
    expect(result.current.activeId).toBe("vid-2");
    expect(result.current.durationS).toBe(300);
    expect(result.current.currentTimeNow()).toBe(slot(1).currentTime);
    expect(result.current.positionS).toBe(slot(1).currentTime);
    expect(result.current.source).toMatchObject({ url: "https://s/b.mp4", durationSeconds: 300 });
  });

  it("a rate change before B starts lands in step at the new rate", async () => {
    const { result } = await open();
    tap(result);
    await flush();
    act(() => result.current.setRate(2));
    setAClock({ rate: 2 });
    act(() => readyPlayer(idx(1)));
    await chaseInStep(result, { rate: 2 });
    expect(state(result).phase).toBe("landing");
    expect(slot(1).playbackRate).toBe(2);
  });

  it("iOS: no rate write starts B before its planned play, and the released A stays stopped", async () => {
    const { result } = await open();
    slot(0).rateStartsPlayback = true;
    slot(1).rateStartsPlayback = true;
    tap(result);
    await bReady();
    expect(slot(1).playing).toBe(false);
    await advance(700);
    expect(slot(1).playing).toBe(false);
    await chaseInStep(result);
    expect(state(result).phase).toBe("landing");
    await advance(SWITCH_SETTLE_MS);
    expect(slot(0).releases).toBe(1);
    expect(slot(0).playing).toBe(false);
  });
});

describe("keep-watching switch: unsynced angles (null offsets, coordinator 2026-10-06)", () => {
  const NULLS = { fromMs: null, toMs: null };

  it("mid-play: keeps A playing and lands approximate (no sync check, dip audio cut)", async () => {
    const { result } = await open();
    tap(result, "vid-2", { offsets: NULLS });
    expect(state(result)).toMatchObject({ phase: "pending", mode: "keep_watching", approximate: true });
    expect(mockTelemetry.switchFallback).not.toHaveBeenCalled();
    await bReady();
    await chaseInStep(result, { errorS: 0.4, samples: 1 });
    expect(state(result)).toMatchObject({ phase: "landing", approximate: true });
    expect(slot(0).pause).not.toHaveBeenCalled();
    expect(slot(0).mutes).toEqual([]);
    expect(mockTelemetry.switchKeepWatchingLanded).toHaveBeenCalledWith(expect.objectContaining({ exact: false }));
    await advance(DIP_MS);
    expect(slot(0).muted).toBe(true);
    expect(slot(1).muted).toBe(false);
  });

  it("paused: lands approximate on B's first frame at A's own time", async () => {
    const { result } = await open({ paused: true });
    tap(result, "vid-2", { offsets: { fromMs: 1200, toMs: null } });
    expect(state(result).approximate).toBe(true);
    await flush();
    expect(slot(1).seeks).toEqual([10]);
    act(() => result.current.onSlotFirstFrame(1));
    expect(state(result)).toMatchObject({ phase: "landing", approximate: true });
    expect(slot(1).play).not.toHaveBeenCalled();
  });

  it("an unsynced switch past a shorter angle's end lands at the edge; a load error still retries once", async () => {
    signAll({ "vid-4": () => Promise.resolve(playable("https://s/d.mp4", { durationSeconds: 10.6 })) });
    const { result } = await open();
    failReplace(idx(1), "network lost");
    tap(result, "vid-4", { offsets: NULLS });
    await flush();
    await flush();
    expect(mockTelemetry.switchLoadRetried).toHaveBeenCalledTimes(1);
    // 10 + 1 s lead is past 10.1 (10.6 - 0.5): the edge.
    expect(slot(1).seeks.at(-1)).toBeCloseTo(10.1);
    act(() => readyPlayer(idx(1), 10.6));
    expect(state(result)).toMatchObject({ phase: "landing", approximate: true });
  });
});
