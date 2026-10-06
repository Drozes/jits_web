import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

const mockCaptureMessage = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
}));

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: jest.fn(async () => ({ type: "cellular", details: { cellularGeneration: "5g" } })) },
}));

import { usePlaybackTelemetry } from "@/lib/video/use-playback-telemetry";

function fakePlayer() {
  const listeners: Array<{ event: string; fn: (p?: unknown) => void }> = [];
  return {
    addListener: jest.fn((event: string, fn: (p?: unknown) => void) => {
      const entry = { event, fn };
      listeners.push(entry);
      return { remove: () => listeners.splice(listeners.indexOf(entry), 1) };
    }),
    emit: (event: string, payload?: unknown) => listeners.filter((l) => l.event === event).forEach((l) => l.fn(payload)),
    count: () => listeners.length,
  };
}

let appStateHandler: ((s: string) => void) | null = null;
let now = 0;

beforeEach(() => {
  mockCaptureMessage.mockReset();
  now = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_e, fn) => {
    appStateHandler = fn as (s: string) => void;
    return { remove: () => (appStateHandler = null) } as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => jest.restoreAllMocks());

const META = { surface: "match" as const, videoId: "vid-1", angle: null, angleCount: null };

function setup() {
  const player = fakePlayer();
  const hook = renderHook(() => usePlaybackTelemetry(player as never, META));
  return { player, hook };
}

function extra(call = 0) {
  return mockCaptureMessage.mock.calls[call][1].extra;
}

describe("usePlaybackTelemetry", () => {
  it("sends exactly one event on unmount, fed by the player's own events", async () => {
    const { player, hook } = setup();
    await act(async () => undefined); // NetInfo
    act(() => {
      hook.result.current.playIntent(true);
      now += 300;
      hook.result.current.sourceAttached("original");
      now += 700;
      player.emit("statusChange", { status: "readyToPlay" });
      player.emit("playingChange", { isPlaying: true });
      player.emit("sourceLoad", { duration: 400 });
      now += 10_000;
      player.emit("timeUpdate", { currentTime: 10 });
      player.emit("statusChange", { status: "loading" });
      player.emit("playingChange", { isPlaying: false });
      now += 2_000;
      player.emit("statusChange", { status: "readyToPlay" });
      player.emit("playingChange", { isPlaying: true });
      now += 5_000;
    });
    expect(mockCaptureMessage).not.toHaveBeenCalled();
    hook.unmount();
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage.mock.calls[0][1].tags).toMatchObject({
      "video.playback.surface": "match",
      "video.playback.source": "original",
      "video.playback.network": "cellular",
      "video.playback.mode": "single",
      "video.playback.outcome": "watched",
    });
    expect(extra()).toMatchObject({
      videoId: "vid-1",
      signMs: 300,
      timeToFirstFrameMs: 1000,
      watchMs: 15_000,
      stallCount: 1,
      stallMs: 2000,
      durationS: 400,
      maxPositionS: 10,
      cellularGeneration: "5g",
      endReason: "unmount",
    });
    // Listeners are released with the screen.
    expect(player.count()).toBe(0);
  });

  it("does not report a screen that never got a source", () => {
    const { hook } = setup();
    hook.unmount();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("records a player status error", () => {
    const { player, hook } = setup();
    act(() => {
      hook.result.current.sourceAttached("normalized");
      player.emit("statusChange", { status: "error", error: { message: "failed https://s/x?token=1" } });
    });
    hook.unmount();
    expect(extra()).toMatchObject({ errorCount: 1, error: "failed <url>", endedInError: true });
    expect(mockCaptureMessage.mock.calls[0][1].tags["video.playback.outcome"]).toBe("error");
  });

  it("flushes on background and opens a continuation on return", async () => {
    const { player, hook } = setup();
    act(() => {
      hook.result.current.playIntent(true);
      hook.result.current.sourceAttached("normalized");
      player.emit("playingChange", { isPlaying: true });
      now += 4000;
    });
    act(() => appStateHandler!("background"));
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(extra(0)).toMatchObject({ endReason: "background", watchMs: 4000, resumed: false });

    // Events while backgrounded have no session to land in.
    act(() => player.emit("playingChange", { isPlaying: false }));
    act(() => appStateHandler!("active"));
    await act(async () => undefined);
    act(() => {
      player.emit("playingChange", { isPlaying: true });
      now += 2000;
    });
    hook.unmount();
    expect(mockCaptureMessage).toHaveBeenCalledTimes(2);
    expect(extra(1)).toMatchObject({ resumed: true, sourceKind: "normalized", watchMs: 2000, endReason: "unmount" });
  });

  it("a continuation where nothing played sends nothing", () => {
    const { hook } = setup();
    act(() => hook.result.current.sourceAttached("normalized"));
    act(() => appStateHandler!("background"));
    act(() => appStateHandler!("active"));
    hook.unmount();
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
  });

  it("forwards the angle switch phase 1 counters (jits-xfvd.16), fresh in a continuation", async () => {
    const { player, hook } = setup();
    act(() => {
      const t = hook.result.current;
      t.playIntent(true);
      t.sourceAttached("normalized");
      player.emit("playingChange", { isPlaying: true });
      // Superseded, then the second lands with its still up and the pill shown.
      t.switchStarted();
      t.switchSuperseded();
      t.switchStarted();
      t.switchPillShown();
      now += 400;
      t.switchLanded();
      t.switchHeldStill();
      // A third fails (its previous angle comes back).
      t.switchStarted();
      t.switchFailed();
    });
    act(() => appStateHandler!("background"));
    expect(extra(0)).toMatchObject({
      switchCount: 3,
      switchLatencyMs: 400,
      switchHeldStillCount: 1,
      switchPillShownCount: 1,
      switchFailedCount: 1,
      switchSupersededCount: 1,
    });
    act(() => appStateHandler!("active"));
    await act(async () => undefined);
    act(() => {
      player.emit("playingChange", { isPlaying: true });
      now += 1000;
    });
    hook.unmount();
    expect(extra(1)).toMatchObject({
      resumed: true,
      switchHeldStillCount: 0,
      switchPillShownCount: 0,
      switchFailedCount: 0,
      switchSupersededCount: 0,
    });
  });
});

describe("usePlaybackTelemetry adaptive quality", () => {
  const QMETA = {
    qualityPreference: "auto" as const,
    settingsVersion: 1,
    settingsSource: "builtin" as const,
    adaptiveEnabled: true,
    networkKey: "wifi",
    connectionExpensive: false,
    startTarget: "720" as const,
    startReason: "network_default" as const,
  };
  const { BUILTIN_PLAYBACK_SETTINGS } = require("@jits/shared/utils");
  const history = require("@/lib/video/quality/history-store");
  beforeEach(() => history.__resetPlaybackHistoryForTests());

  it("copies the quality meta, the rendition and the flags into a continuation, and re-wires onStall", async () => {
    const { player, hook } = setup();
    const stalls: string[] = [];
    act(() => {
      hook.result.current.onStall((e) => stalls.push(e.kind));
      hook.result.current.setQuality(QMETA, BUILTIN_PLAYBACK_SETTINGS);
      hook.result.current.playIntent(true);
      hook.result.current.sourceAttached("normalized");
      hook.result.current.renditionAttached("720", "pb1");
      player.emit("playingChange", { isPlaying: true });
      now += 1000;
      hook.result.current.qualitySwitchStarted("720", "360", "stall_long", { lockedLow: true, capReached: false });
      hook.result.current.renditionAttached("360", "pb1");
      now += 1000;
    });
    act(() => appStateHandler!("background"));
    act(() => appStateHandler!("active"));
    act(() => {
      player.emit("playingChange", { isPlaying: true });
      now += 3000;
      player.emit("statusChange", { status: "loading" });
      now += 500;
      player.emit("statusChange", { status: "readyToPlay" });
      now += 1000;
    });
    hook.unmount();
    expect(extra(0)).toMatchObject({ qualitySwitchCount: 1, startRendition: "720", finalRendition: "360", qualityLockedLow: true });
    expect(extra(1)).toMatchObject({
      resumed: true,
      ...QMETA,
      startRendition: "360",
      finalRendition: "360",
      msOn360: 4500,
      qualityLockedLow: true,
      qualitySwitchCount: 0,
      // Review telemetry M1: a continuation has no start of its own, and the earlier step-down shows.
      startFallback: null,
      qualitySteppedDown: true,
    });
    expect(mockCaptureMessage.mock.calls[1][1].tags).toMatchObject({
      "video.playback.resumed": "true",
      "video.playback.stepdown": "stall",
      "video.playback.rendition": "360",
    });
    // The continuation's stall reached the listener.
    expect(stalls).toEqual(["start", "end"]);
  });

  it("review: a new start selection (a new video on this screen) resets the carried flags", async () => {
    const { player, hook } = setup();
    act(() => {
      hook.result.current.setQuality(QMETA, BUILTIN_PLAYBACK_SETTINGS);
      hook.result.current.playIntent(true);
      hook.result.current.sourceAttached("normalized");
      hook.result.current.renditionAttached("720", null);
      player.emit("playingChange", { isPlaying: true });
      hook.result.current.qualitySwitchStarted("720", "360", "stall_long", { lockedLow: true, capReached: true });
      // An outside navigation: a new video, a new start selection.
      hook.result.current.setQuality({ ...QMETA, startTarget: "360" }, BUILTIN_PLAYBACK_SETTINGS);
      now += 1000;
    });
    act(() => appStateHandler!("background"));
    act(() => appStateHandler!("active"));
    act(() => {
      player.emit("playingChange", { isPlaying: true });
      now += 2000;
    });
    hook.unmount();
    expect(extra(1)).toMatchObject({ resumed: true, qualitySteppedDown: false, qualityLockedLow: false, qualityCapReached: false });
    expect(mockCaptureMessage.mock.calls[1][1].tags["video.playback.stepdown"]).toBe("none");
  });

  it("records the finished session in the per-network history", async () => {
    const { player, hook } = setup();
    act(() => {
      hook.result.current.setQuality(QMETA, BUILTIN_PLAYBACK_SETTINGS);
      hook.result.current.playIntent(true);
      hook.result.current.sourceAttached("normalized");
      hook.result.current.renditionAttached("720", null);
      player.emit("playingChange", { isPlaying: true });
      now += 20_000;
    });
    hook.unmount();
    expect(history.getPlaybackHistory("wifi")).toEqual([
      expect.objectContaining({ ts: now, rendition: "720", finalRendition: "720", watchMs: 20_000, steppedDown: false }),
    ]);
  });

  it("a session without quality meta (a reel) leaves no history", () => {
    const { player, hook } = setup();
    act(() => {
      hook.result.current.playIntent(true);
      hook.result.current.sourceAttached("normalized");
      player.emit("playingChange", { isPlaying: true });
      now += 20_000;
    });
    hook.unmount();
    expect(history.getPlaybackHistory("wifi")).toEqual([]);
  });
});

describe("usePlaybackTelemetry front rebind (jits-xfvd.19)", () => {
  it("follows the new front player with a playing resync: no pause, no stall at the swap; the old one is dropped", async () => {
    const a = Object.assign(fakePlayer(), { playing: true });
    const b = Object.assign(fakePlayer(), { playing: true });
    const hook = renderHook(({ p }: { p: ReturnType<typeof fakePlayer> }) => usePlaybackTelemetry(p as never, META), {
      initialProps: { p: a },
    });
    await act(async () => undefined);
    act(() => {
      hook.result.current.playIntent(true);
      hook.result.current.sourceAttached("normalized");
      a.emit("statusChange", { status: "readyToPlay" });
      a.emit("playingChange", { isPlaying: true });
      now += 5_000;
    });
    hook.rerender({ p: b });
    expect(a.count()).toBe(0);
    act(() => {
      // The old front pausing after the swap is not this session's pause.
      a.emit("playingChange", { isPlaying: false });
      now += 5_000;
      b.emit("timeUpdate", { currentTime: 20 });
      hook.result.current.switchTapIgnored();
    });
    hook.unmount();
    const out = extra();
    expect(out.watchMs).toBe(10_000);
    expect(out.stallCount).toBe(0);
    expect(out.switchIgnoredTapCount).toBe(1);
  });
});
