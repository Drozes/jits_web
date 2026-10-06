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
    expect(mockCaptureMessage.mock.calls[0][1].tags).toEqual({
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
});
