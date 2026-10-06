import * as fs from "fs";
import * as path from "path";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";

/**
 * The hook alone (jits-n2im.19): load, error and re-sign, seek, rate and end,
 * plus the edges of swapping a URL into ONE expo-video player. The screen
 * suite (`__tests__/screens/video-playback.test.tsx`) covers the same flows
 * through the controls and the angle switch.
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
  error: jest.fn(),
  setQuality: jest.fn(),
  renditionAttached: jest.fn(),
  qualitySwitchStarted: jest.fn(),
  qualitySwitchLanded: jest.fn(),
  onStall: jest.fn((cb: (e: { kind: "start" | "end"; at: number }) => void) => {
    mockStallListeners.add(cb);
    return () => mockStallListeners.delete(cb);
  }),
};
const mockStallListeners = new Set<(e: { kind: "start" | "end"; at: number }) => void>();
jest.mock("@/lib/video/use-playback-telemetry", () => ({
  usePlaybackTelemetry: () => mockTelemetry,
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockSign = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchVideoPlaybackResult: (...a: unknown[]) => mockSign(...a),
}));

type Listener = { event: string; fn: (payload?: any) => void };
interface FakePlayer {
  source: { uri: string } | null;
  status: string;
  playing: boolean;
  duration: number;
  playbackRate: number;
  seeks: number[];
  currentTime: number;
  timeUpdateEventInterval: number;
  preservesPitch: boolean;
  play: jest.Mock;
  pause: jest.Mock;
  replaceAsync: jest.Mock;
  addListener: jest.Mock;
  emit: (event: string, payload?: unknown) => void;
}
const mockPlayers: FakePlayer[] = [];
jest.mock("expo-video", () => {
  const R = require("react");
  function useVideoPlayer(_s: unknown, setup?: (p: FakePlayer) => void) {
    const ref = R.useRef(null);
    if (!ref.current) {
      const listeners: Listener[] = [];
      let time = 0;
      const p = {
        source: null,
        status: "idle",
        playing: false,
        duration: 0,
        playbackRate: 1,
        timeUpdateEventInterval: 0,
        preservesPitch: false,
        seeks: [] as number[],
        get currentTime() {
          return time;
        },
        set currentTime(v: number) {
          time = v;
          p.seeks.push(v);
        },
        play: jest.fn(() => {
          p.playing = true;
        }),
        pause: jest.fn(() => {
          p.playing = false;
        }),
        replaceAsync: jest.fn((src: { uri: string }) => {
          p.source = src;
          p.status = "loading";
          return Promise.resolve();
        }),
        addListener: jest.fn((event: string, fn: (payload?: unknown) => void) => {
          const e = { event, fn };
          listeners.push(e);
          return { remove: () => listeners.splice(listeners.indexOf(e), 1) };
        }),
        emit: (event: string, payload?: unknown) => {
          if (event === "timeUpdate") time = (payload as { currentTime: number }).currentTime;
          listeners.filter((l) => l.event === event).forEach((l) => l.fn(payload));
        },
      } as FakePlayer;
      setup?.(p);
      mockPlayers.push(p);
      ref.current = p;
    }
    return ref.current;
  }
  return { useVideoPlayer };
});

import { useVideoPlayback } from "@/lib/match-detail/use-video-playback";

function playable(url: string, extra: Record<string, unknown> = {}) {
  return { ok: true, data: { url, posterUrl: null, status: "ready", playability: "playable", matchId: "m", durationSeconds: 400, sourceKind: "normalized", ...extra } };
}
const player = () => mockPlayers[mockPlayers.length - 1];
function ready(duration = 400) {
  act(() => {
    player().status = "readyToPlay";
    player().duration = duration;
    player().emit("statusChange", { status: "readyToPlay" });
  });
}
const time = (t: number) => act(() => player().emit("timeUpdate", { currentTime: t }));
const fail = async (message = "err") => {
  await act(async () => {
    player().status = "error";
    player().emit("statusChange", { status: "error", error: { message } });
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayers.length = 0;
});

describe("useVideoPlayback", () => {
  it("sets the player up for 250 ms time updates and pitch-corrected speed", async () => {
    mockSign.mockResolvedValue(playable("https://s/a.mp4"));
    renderHook(() => useVideoPlayback("vid-1"));
    expect(player().timeUpdateEventInterval).toBe(0.25);
    expect(player().preservesPitch).toBe(true);
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalled());
  });

  it("loads: swaps the URL in, reports the source kind, plays once ready", async () => {
    mockSign.mockResolvedValue(playable("https://s/a.mp4", { sourceKind: "original" }));
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledWith({ uri: "https://s/a.mp4" }));
    expect(mockTelemetry.sourceAttached).toHaveBeenCalledWith("original");
    expect(mockTelemetry.playIntent).toHaveBeenCalledWith(true);
    expect(result.current.stateLabel).toBe("loading");
    ready(400);
    expect(result.current.stateLabel).toBe("loaded");
    expect(result.current.durationS).toBe(400);
    expect(player().play).toHaveBeenCalledTimes(1);
    time(3);
    expect(result.current.positionS).toBe(3);
  });

  it("starts at the ?t= point by seeking on load", async () => {
    mockSign.mockResolvedValue(playable("https://s/a.mp4"));
    const { result } = renderHook(() => useVideoPlayback("vid-1", 27));
    expect(result.current.positionS).toBe(27);
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalled());
    ready();
    expect(player().seeks).toEqual([27]);
  });

  it("errors: re-signs silently, swaps into the SAME player, resumes at the position", async () => {
    mockSign.mockResolvedValueOnce(playable("https://s/old.mp4"));
    mockSign.mockResolvedValueOnce(playable("https://s/new.mp4"));
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    time(42);
    await fail("expired");
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    expect(mockPlayers).toHaveLength(1);
    expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/new.mp4" });
    expect(mockTelemetry.resigned).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("ready");
    ready();
    expect(player().seeks).toEqual([42]);
    expect(result.current.stateLabel).toBe("loaded");
  });

  it("ignores an error from the old item while the new URL's swap is in flight", async () => {
    mockSign.mockResolvedValue(playable("https://s/a.mp4"));
    renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    let resolveSwap!: () => void;
    player().replaceAsync.mockImplementationOnce(() => new Promise<void>((r) => (resolveSwap = r)));
    await fail("expired");
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    // The dying item reports again before the swap settles: no third sign.
    await fail("again");
    expect(mockSign).toHaveBeenCalledTimes(2);
    await act(async () => resolveSwap());
  });

  it("reloads the latest URL when a superseded swap settles after it", async () => {
    mockSign.mockResolvedValueOnce(playable("https://s/one.mp4"));
    mockSign.mockResolvedValueOnce(playable("https://s/two.mp4"));
    let resolveFirst!: () => void;
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(mockPlayers).toHaveLength(1));
    player().replaceAsync.mockImplementationOnce((src: { uri: string }) => {
      player().source = src;
      return new Promise<void>((r) => (resolveFirst = r));
    });
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    // The athlete retries while the first swap hangs.
    await act(async () => result.current.retry());
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    await act(async () => resolveFirst());
    expect(player().replaceAsync).toHaveBeenCalledTimes(3);
    expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/two.mp4" });
  });

  it("seeks clamped to the duration and holds the clock until the seek lands", async () => {
    mockSign.mockResolvedValue(playable("https://s/a.mp4"));
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalled());
    ready(400);
    time(10);
    act(() => result.current.seek(900));
    expect(player().seeks.at(-1)).toBe(400);
    expect(mockTelemetry.seekRequested).toHaveBeenCalledTimes(1);
    time(10.25); // still the old spot
    expect(result.current.positionS).toBe(400);
    act(() => result.current.seek(-5));
    expect(player().seeks.at(-1)).toBe(0);
  });

  it("pauses, defers a paused speed change, and restarts from 0 after the end", async () => {
    mockSign.mockResolvedValue(playable("https://s/a.mp4"));
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalled());
    ready(400);
    act(() => result.current.toggle());
    expect(player().pause).toHaveBeenCalled();
    expect(mockTelemetry.playIntent).toHaveBeenLastCalledWith(false);
    act(() => result.current.setRate(2));
    expect(player().playbackRate).toBe(1);
    act(() => result.current.toggle());
    expect(player().playbackRate).toBe(2);
    expect(player().playing).toBe(true);

    time(399.9);
    act(() => player().emit("playToEnd"));
    expect(result.current.playing).toBe(false);
    act(() => result.current.toggle());
    expect(player().seeks.at(-1)).toBe(0);
    expect(result.current.playing).toBe(true);
  });

  it("shows paused after the app goes to the background", async () => {
    let handler: ((s: string) => void) | null = null;
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation((_e, fn) => {
      handler = fn as (s: string) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    try {
      mockSign.mockResolvedValue(playable("https://s/a.mp4"));
      const { result } = renderHook(() => useVideoPlayback("vid-1"));
      await waitFor(() => expect(player().replaceAsync).toHaveBeenCalled());
      ready();
      expect(result.current.playing).toBe(true);
      act(() => handler!("background"));
      expect(result.current.playing).toBe(false);
      expect(player().pause).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("marks the frame shown from onFirstFrameRender for the settled item", async () => {
    mockSign.mockResolvedValue(playable("https://s/a.mp4"));
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalled());
    await act(async () => undefined);
    expect(result.current.frameShown).toBe(false);
    act(() => result.current.onFirstFrameRender());
    expect(result.current.frameShown).toBe(true);
    expect(mockTelemetry.firstFrame).toHaveBeenCalled();
  });

  it("reports how each sign ended to telemetry", async () => {
    mockSign.mockResolvedValueOnce({ ok: false, error: { code: "VIDEO_FILE_MISSING", message: "x" } });
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(result.current.phase).toBe("missing"));
    expect(mockTelemetry.signOutcome).toHaveBeenLastCalledWith("missing");
    mockSign.mockResolvedValueOnce(playable("https://s/a.mp4"));
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(mockTelemetry.signOutcome).toHaveBeenLastCalledWith("ok");
  });

  it("a superseded swap's reload seeks back to the position (m4)", async () => {
    mockSign.mockResolvedValueOnce(playable("https://s/one.mp4"));
    mockSign.mockResolvedValueOnce(playable("https://s/two.mp4"));
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    time(0);
    time(30);
    // A re-sign whose old swap hangs, then the athlete's Retry wins the race.
    let resolveStale!: () => void;
    player().replaceAsync.mockImplementationOnce((src: { uri: string }) => {
      player().source = src;
      return new Promise<void>((r) => (resolveStale = r));
    });
    await fail("expired");
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    mockSign.mockResolvedValueOnce(playable("https://s/three.mp4"));
    await act(async () => result.current.retry());
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(3));
    ready();
    expect(result.current.stateLabel).toBe("loaded");
    player().seeks.length = 0;
    await act(async () => resolveStale());
    expect(player().replaceAsync).toHaveBeenCalledTimes(4);
    expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/three.mp4" });
    expect(result.current.stateLabel).toBe("loading");
    ready();
    expect(player().seeks).toEqual([30]);
  });

  it("a seek made while a re-signed URL is loading is where it resumes (m5)", async () => {
    mockSign.mockResolvedValue(playable("https://s/a.mp4"));
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    time(0);
    time(42);
    await fail("expired");
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    act(() => result.current.seek(100));
    player().seeks.length = 0;
    ready();
    expect(player().seeks).toEqual([100]);
  });

  it("plays anyway if a settled item is still not ready after 3 s (m6)", async () => {
    jest.useFakeTimers();
    try {
      mockSign.mockResolvedValue(playable("https://s/a.mp4"));
      renderHook(() => useVideoPlayback("vid-1", 12));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      await waitFor(() => expect(player().replaceAsync).toHaveBeenCalled());
      await act(async () => undefined);
      expect(player().play).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(3000));
      expect(player().play).toHaveBeenCalledTimes(1);
      // The resume seek still lands once the item reports ready.
      ready();
      expect(player().seeks).toEqual([12]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("no fallback play once the item was ready in time, or when paused", async () => {
    jest.useFakeTimers();
    try {
      mockSign.mockResolvedValue(playable("https://s/a.mp4"));
      const { result } = renderHook(() => useVideoPlayback("vid-1"));
      await waitFor(() => expect(player().replaceAsync).toHaveBeenCalled());
      await act(async () => undefined);
      act(() => result.current.setPlaying(false));
      act(() => jest.advanceTimersByTime(5000));
      expect(player().play).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("is absent without an id and never signs", async () => {
    const { result } = renderHook(() => useVideoPlayback(undefined));
    await waitFor(() => expect(result.current.phase).toBe("absent"));
    expect(mockSign).not.toHaveBeenCalled();
  });
});

describe("expo-av is gone from the app (jits-n2im.19)", () => {
  // expo-av leaves the binary in the next TestFlight build (jits-n2im.31):
  // a stray import anywhere would crash after that build.
  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === "node_modules" ? [] : sources(full);
      return /\.(ts|tsx|js|jsx)$/.test(e.name) ? [full] : [];
    });
  }
  it("no file under app/, components/ or lib/ imports expo-av", () => {
    const root = path.join(__dirname, "../../..");
    const offenders = ["app", "components", "lib"]
      .flatMap((d) => sources(path.join(root, d)))
      .filter((f) => /from\s+["']expo-av["']|require\(["']expo-av["']\)/.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("useVideoPlayback angle switch (multi-angle P0)", () => {
  function signById(urls: Record<string, string>) {
    mockSign.mockImplementation((_c: unknown, vid: string) => Promise.resolve(playable(urls[vid] ?? "https://s/x.mp4")));
  }

  it("switches in the SAME player at the exact position, keeping play state and speed", async () => {
    signById({ "vid-1": "https://s/a.mp4", "vid-2": "https://s/b.mp4" });
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    act(() => result.current.presign(["vid-1", "vid-2"]));
    await waitFor(() => expect(mockSign).toHaveBeenCalledWith({}, "vid-2", { rendition: "720" }));
    await act(async () => undefined);
    act(() => result.current.setRate(0.5));
    time(42.637);
    expect(result.current.currentTimeNow()).toBe(42.637);
    const signs = mockSign.mock.calls.length;
    act(() => result.current.switchAngle("vid-2", 40.137));
    // Pre-signed: no new sign round trip.
    expect(mockSign).toHaveBeenCalledTimes(signs);
    expect(result.current.activeId).toBe("vid-2");
    expect(result.current.phase).toBe("ready");
    expect(result.current.positionS).toBe(40.137);
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/b.mp4" }));
    expect(mockPlayers).toHaveLength(1);
    expect(mockTelemetry.switchStarted).toHaveBeenCalledTimes(1);
    expect(player().pause).toHaveBeenCalled();
    ready();
    expect(player().seeks.at(-1)).toBe(40.137);
    expect(player().playing).toBe(true);
    expect(player().playbackRate).toBe(0.5);
    expect(result.current.playing).toBe(true);
    expect(result.current.rate).toBe(0.5);
    // The held frame stands in until the new angle draws: no poster flash.
    expect(result.current.frameShown).toBe(true);
    // A first frame before the resume seek lands may be frame 0: not landed.
    act(() => result.current.onFirstFrameRender());
    expect(mockTelemetry.switchLanded).not.toHaveBeenCalled();
    time(40.137);
    expect(mockTelemetry.switchLanded).toHaveBeenCalledTimes(1);
  });

  it("lands paused when the athlete was paused", async () => {
    signById({ "vid-1": "https://s/a.mp4", "vid-2": "https://s/b.mp4" });
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    time(10);
    act(() => result.current.toggle());
    expect(player().playing).toBe(false);
    player().play.mockClear();
    act(() => result.current.switchAngle("vid-2", 12.5));
    // Not pre-signed: signs silently, never drops to the loading phase.
    expect(result.current.phase).toBe("ready");
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/b.mp4" }));
    ready();
    expect(player().seeks.at(-1)).toBe(12.5);
    expect(player().play).not.toHaveBeenCalled();
    expect(result.current.playing).toBe(false);
  });

  it("lands the switch only once the resume seek lands, never on the item's frame 0 (review M2)", async () => {
    signById({ "vid-1": "https://s/a.mp4", "vid-2": "https://s/b.mp4" });
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    time(5);
    act(() => result.current.switchAngle("vid-2", 30));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    // Frame 0 drawn and a stale update at 0 before the seek lands.
    act(() => result.current.onFirstFrameRender());
    ready();
    time(0);
    expect(mockTelemetry.switchLanded).not.toHaveBeenCalled();
    expect(result.current.positionS).toBe(30);
    time(30.02);
    expect(mockTelemetry.switchLanded).toHaveBeenCalledTimes(1);
    time(30.3);
    expect(mockTelemetry.switchLanded).toHaveBeenCalledTimes(1);
  });

  it("paused: a first frame drawn after the resume seek lands the switch (review r2-m1)", async () => {
    signById({ "vid-1": "https://s/a.mp4", "vid-2": "https://s/b.mp4" });
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    time(10);
    act(() => result.current.toggle());
    act(() => result.current.switchAngle("vid-2", 12.5));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    // Before readyToPlay (no seek issued yet): may be frame 0, ignored.
    act(() => result.current.onFirstFrameRender());
    expect(mockTelemetry.switchLanded).not.toHaveBeenCalled();
    ready();
    expect(player().seeks.at(-1)).toBe(12.5);
    act(() => result.current.onFirstFrameRender());
    expect(mockTelemetry.switchLanded).toHaveBeenCalledTimes(1);
    expect(result.current.frameShown).toBe(true);
  });

  it("a switch to 0 has no resume seek: its first frame is the right one", async () => {
    signById({ "vid-1": "https://s/a.mp4", "vid-2": "https://s/b.mp4" });
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    act(() => result.current.onFirstFrameRender());
    act(() => result.current.switchAngle("vid-2", 0));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    ready();
    act(() => result.current.onFirstFrameRender());
    expect(mockTelemetry.switchLanded).toHaveBeenCalledTimes(1);
  });

  it("while the target's sign is pending, the old item no longer counts (review B1)", async () => {
    let resolveB: (v: unknown) => void = () => undefined;
    mockSign.mockImplementation((_c: unknown, vid: string) =>
      vid === "vid-2" ? new Promise((r) => (resolveB = r)) : Promise.resolve(playable("https://s/a.mp4")),
    );
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    time(30);
    act(() => result.current.switchAngle("vid-2", 28.5));
    await waitFor(() => expect(mockSign).toHaveBeenCalledWith({}, "vid-2", { rendition: "720" }));
    expect(result.current.currentTimeNow()).toBe(28.5);
    player().play.mockClear();
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(player().play).not.toHaveBeenCalled();
    // A late update from the old item must not move the resume point.
    time(30.25);
    expect(result.current.positionS).toBe(28.5);
    expect(result.current.currentTimeNow()).toBe(28.5);
    await act(async () => resolveB(playable("https://s/b.mp4")));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/b.mp4" }));
    ready();
    expect(player().seeks.at(-1)).toBe(28.5);
    expect(player().play).toHaveBeenCalled();
  });

  it("a second switch during the first one's sign wins, from the first one's target", async () => {
    let resolveB: (v: unknown) => void = () => undefined;
    mockSign.mockImplementation((_c: unknown, vid: string) =>
      vid === "vid-2" ? new Promise((r) => (resolveB = r)) : Promise.resolve(playable(`https://s/${vid}.mp4`)),
    );
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    time(30);
    act(() => result.current.switchAngle("vid-2", 28.5));
    // The screen translates from what the hook says now: vid-2's 28.5.
    expect(result.current.currentTimeNow()).toBe(28.5);
    act(() => result.current.switchAngle("vid-3", 27));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/vid-3.mp4" }));
    // The first sign answering late is dropped.
    await act(async () => resolveB(playable("https://s/vid-2.mp4")));
    expect(player().replaceAsync).not.toHaveBeenCalledWith({ uri: "https://s/vid-2.mp4" });
    ready();
    expect(result.current.activeId).toBe("vid-3");
    expect(player().seeks.at(-1)).toBe(27);
    expect(mockTelemetry.switchStarted).toHaveBeenCalledTimes(2);
  });

  it("clamps the resume seek to a shorter angle's end (review m1)", async () => {
    signById({ "vid-1": "https://s/a.mp4", "vid-2": "https://s/b.mp4" });
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready(400);
    time(350);
    act(() => result.current.switchAngle("vid-2", 350));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    ready(120);
    expect(player().seeks.at(-1)).toBe(119.5);
    expect(result.current.positionS).toBe(119.5);
    expect(result.current.durationS).toBe(120);
  });

  it("ignores a switch to the angle already on screen", async () => {
    signById({ "vid-1": "https://s/a.mp4" });
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    act(() => result.current.switchAngle("vid-1", 3));
    expect(mockTelemetry.switchStarted).not.toHaveBeenCalled();
    expect(player().replaceAsync).toHaveBeenCalledTimes(1);
  });

  it("shows the poster on a switch made before any frame was on screen", async () => {
    signById({ "vid-1": "https://s/a.mp4", "vid-2": "https://s/b.mp4" });
    const { result } = renderHook(() => useVideoPlayback("vid-1"));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    act(() => result.current.switchAngle("vid-2", 0));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    expect(result.current.frameShown).toBe(false);
  });
});

describe("useVideoPlayback route id changes (review m2, m3)", () => {
  it("ignores its own setParams echo, even a stale one after A, B, A", async () => {
    mockSign.mockImplementation((_c: unknown, vid: string) => Promise.resolve(playable(`https://s/${vid}.mp4`)));
    const { result, rerender } = renderHook(({ id }: { id: string }) => useVideoPlayback(id), { initialProps: { id: "vid-1" } });
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    act(() => result.current.switchAngle("vid-2", 10));
    act(() => result.current.switchAngle("vid-1", 12));
    const signs = mockSign.mock.calls.length;
    const swaps = player().replaceAsync.mock.calls.length;
    // The route renders the intermediate id after the hook is back on vid-1.
    rerender({ id: "vid-2" });
    rerender({ id: "vid-1" });
    await act(async () => undefined);
    expect(result.current.activeId).toBe("vid-1");
    expect(mockSign).toHaveBeenCalledTimes(signs);
    expect(player().replaceAsync).toHaveBeenCalledTimes(swaps);
    expect(result.current.entryId).toBe("vid-1");
  });

  it("an outside navigation to another recording loads it fresh at its own ?t=", async () => {
    mockSign.mockImplementation((_c: unknown, vid: string) => Promise.resolve(playable(`https://s/${vid}.mp4`)));
    const { result, rerender } = renderHook(({ id, t }: { id: string; t: number | null }) => useVideoPlayback(id, t), {
      initialProps: { id: "vid-1", t: null as number | null },
    });
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    time(50);
    rerender({ id: "vid-9", t: 15 });
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/vid-9.mp4" }));
    expect(result.current.entryId).toBe("vid-9");
    expect(result.current.activeId).toBe("vid-9");
    expect(mockTelemetry.setMeta).toHaveBeenCalledWith({ videoId: "vid-9" });
    ready();
    expect(player().seeks.at(-1)).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Adaptive quality (jits-xfvd.12): the quality swap reuses the angle swap.
// ---------------------------------------------------------------------------

describe("useVideoPlayback adaptive quality", () => {
  type Avail = { "720": boolean; "360": boolean };
  const BOTH: Avail = { "720": true, "360": true };
  const ONLY720: Avail = { "720": true, "360": false };
  const ONLY360: Avail = { "720": false, "360": true };
  const NONE: Avail = { "720": false, "360": false };
  /** What the signer serves for a target given a row's copies (its fallback chain). */
  const servedFor = (a: Avail, target: string) =>
    target === "360" ? (a["360"] ? "360" : a["720"] ? "720" : "original") : a["720"] ? "720" : a["360"] ? "360" : "original";
  /** Sign each id at the asked rendition, from its copies. */
  function signCopies(copies: Record<string, Avail>) {
    mockSign.mockImplementation((_c: unknown, vid: string, opts: { rendition: string }) => {
      const a = copies[vid] ?? BOTH;
      const served = servedFor(a, opts.rendition);
      return Promise.resolve(
        playable(`https://s/${vid}.${served}.mp4`, {
          sourceKind: served === "original" ? "original" : "normalized",
          target: opts.rendition,
          servedRendition: served,
          available: a,
          playbackProfile: "pb1",
        }),
      );
    });
  }

  let clock = 0;
  beforeEach(() => {
    clock = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => clock);
    mockStallListeners.clear();
    const pref = require("@/lib/video/quality/preference");
    pref.__resetPlaybackQualityPreferenceForTests("auto");
    require("@/lib/video/quality/history-store").__resetPlaybackHistoryForTests();
    require("@/lib/video/quality/settings-store").__resetPlaybackSettingsStoreForTests();
    require("@/lib/video/quality/network-store").__resetNetworkStoreForTests({ type: "wifi", details: null });
  });
  afterEach(() => jest.restoreAllMocks());

  const stall = (kind: "start" | "end") => act(() => mockStallListeners.forEach((cb) => cb({ kind, at: clock })));

  /** Open vid-1, play it to 10 s with a frame up, then 5 s on. */
  async function open(id = "vid-1") {
    const hook = renderHook(() => useVideoPlayback(id));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    ready();
    time(10);
    clock += 5000;
    return hook;
  }

  /** A stall that lasts 1 s while playing: the controller's stall_long. */
  function longStall(at: number) {
    stall("start");
    clock += 1000;
    time(at);
  }

  it("a step-down swaps the SAME id at the exact position, holding the frame, keeping play and speed", async () => {
    signCopies({ "vid-1": BOTH });
    const { result } = await open();
    expect(mockSign).toHaveBeenLastCalledWith({}, "vid-1", { rendition: "720" });
    act(() => result.current.setRate(1.5));
    longStall(10.25);
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenCalledWith("720", "360", "stall_long", {
      lockedLow: false,
      capReached: false,
    });
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/vid-1.360.mp4" }));
    expect(mockSign).toHaveBeenLastCalledWith({}, "vid-1", { rendition: "360" });
    expect(result.current.activeId).toBe("vid-1");
    // The outgoing frame stays up, never the poster.
    expect(result.current.source?.holdFrame).toBe(true);
    expect(result.current.frameShown).toBe(true);
    // Not an angle switch.
    expect(mockTelemetry.switchStarted).not.toHaveBeenCalled();
    // The duration stays (same timeline).
    expect(result.current.durationS).toBe(400);
    player().play.mockClear();
    ready();
    expect(player().seeks.at(-1)).toBe(10.25);
    expect(player().play).toHaveBeenCalled();
    expect(player().playbackRate).toBe(1.5);
    // Landed only once the resume seek landed.
    expect(mockTelemetry.qualitySwitchLanded).not.toHaveBeenCalled();
    time(10.3);
    expect(mockTelemetry.qualitySwitchLanded).toHaveBeenCalledTimes(1);
    expect(mockTelemetry.switchLanded).not.toHaveBeenCalled();
    expect(mockTelemetry.renditionAttached).toHaveBeenLastCalledWith("360", "pb1");
  });

  it("paused stays paused across a quality swap", async () => {
    signCopies({ "vid-1": BOTH });
    const { result } = await open();
    // Stall counted while playing, then the athlete pauses: no decision.
    stall("start");
    act(() => result.current.toggle());
    clock += 2000;
    time(10.25);
    stall("end");
    expect(mockTelemetry.qualitySwitchStarted).not.toHaveBeenCalled();
    expect(result.current.playing).toBe(false);
  });

  it("an angle switch after a step-down signs the new angle at 360 (cache keyed per rendition)", async () => {
    signCopies({ "vid-1": BOTH, "vid-2": BOTH });
    const { result } = await open();
    act(() => result.current.presign(["vid-2"]));
    await waitFor(() => expect(mockSign).toHaveBeenCalledWith({}, "vid-2", { rendition: "720" }));
    longStall(10.25);
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/vid-1.360.mp4" }));
    ready();
    time(10.3);
    act(() => result.current.switchAngle("vid-2", 20));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/vid-2.360.mp4" }));
    expect(mockSign).toHaveBeenCalledWith({}, "vid-2", { rendition: "360" });
    expect(mockTelemetry.switchStarted).toHaveBeenCalledTimes(1);
  });

  it("no quality swap is issued during an angle switch", async () => {
    let resolveB: (v: unknown) => void = () => undefined;
    signCopies({ "vid-1": BOTH });
    const base = mockSign.getMockImplementation()!;
    mockSign.mockImplementation((c: unknown, vid: string, o: { rendition: string }) =>
      vid === "vid-2" ? new Promise((r) => (resolveB = r)) : base(c, vid, o),
    );
    const { result } = await open();
    act(() => result.current.switchAngle("vid-2", 12));
    longStall(10.25);
    clock += 3000;
    time(10.5);
    expect(mockTelemetry.qualitySwitchStarted).not.toHaveBeenCalled();
    await act(async () => resolveB(playable("https://s/b.mp4")));
  });

  it("Data saver starts at 360; High at 720; neither ever switches", async () => {
    signCopies({ "vid-1": BOTH });
    require("@/lib/video/quality/preference").__resetPlaybackQualityPreferenceForTests("data_saver");
    const saver = await open();
    expect(mockSign).toHaveBeenLastCalledWith({}, "vid-1", { rendition: "360" });
    longStall(10.25);
    clock += 120_000;
    time(11);
    expect(mockTelemetry.qualitySwitchStarted).not.toHaveBeenCalled();
    saver.unmount();

    require("@/lib/video/quality/preference").__resetPlaybackQualityPreferenceForTests("high");
    await open();
    expect(mockSign).toHaveBeenLastCalledWith({}, "vid-1", { rendition: "720" });
    longStall(10.25);
    expect(mockTelemetry.qualitySwitchStarted).not.toHaveBeenCalled();
  });

  it("Auto on 3G starts at 360 and reports the start selection", async () => {
    signCopies({ "vid-1": BOTH });
    require("@/lib/video/quality/network-store").__resetNetworkStoreForTests({
      type: "cellular",
      details: { cellularGeneration: "3g" },
    });
    await open();
    expect(mockSign).toHaveBeenLastCalledWith({}, "vid-1", { rendition: "360" });
    expect(mockTelemetry.setQuality).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityPreference: "auto",
        settingsSource: "builtin",
        networkKey: "cellular_3g",
        startTarget: "360",
        startReason: "network_default",
      }),
      expect.objectContaining({ version: 1 }),
    );
  });

  it("review H1 (RV1): a failed 360 sign keeps the 720 playing and a later decision is still possible", async () => {
    signCopies({ "vid-1": BOTH });
    const base = mockSign.getMockImplementation()!;
    mockSign.mockImplementation((c: unknown, vid: string, o: { rendition: string }) =>
      o.rendition === "360" ? Promise.resolve({ ok: false, error: { code: "UNKNOWN", message: "down" } }) : base(c, vid, o),
    );
    const { result } = await open();
    act(() => result.current.setRate(1.5));
    longStall(10.25);
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenCalledTimes(1);
    // The 720 file goes back in at the exact spot behind the held frame.
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/vid-1.720.mp4" });
    expect(result.current.phase).toBe("ready");
    expect(result.current.source?.holdFrame).toBe(true);
    expect(mockTelemetry.signOutcome).not.toHaveBeenCalledWith("failed");
    ready();
    expect(player().seeks.at(-1)).toBe(10.25);
    expect(player().playbackRate).toBe(1.5);
    expect(result.current.playing).toBe(true);
    time(10.3);
    expect(result.current.stateLabel).toBe("loaded");
    // Not stuck: after the cooldown, another long stall decides again.
    clock += 5000;
    time(10.6);
    longStall(10.7);
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenCalledTimes(2);
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenLastCalledWith("720", "360", expect.stringMatching(/^stall_/), expect.anything());
  });

  it("review H2 (RV2): an angle switch while the 360 sign is pending does not leave the controller stuck", async () => {
    signCopies({ "vid-1": BOTH, "vid-2": BOTH });
    const base = mockSign.getMockImplementation()!;
    mockSign.mockImplementation((c: unknown, vid: string, o: { rendition: string }) =>
      vid === "vid-1" && o.rendition === "360" ? new Promise(() => undefined) : base(c, vid, o),
    );
    const { result } = await open();
    longStall(10.25);
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenCalledTimes(1);
    act(() => result.current.switchAngle("vid-2", 12));
    // Round 2 (R2-M1): the dropped step-down is lost; vid-2 signs at the served 720.
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/vid-2.720.mp4" }));
    ready();
    time(12.05);
    expect(mockTelemetry.switchLanded).toHaveBeenCalledTimes(1);
    // Not stuck: after the cooldown a new long stall decides again.
    clock += 5000;
    time(12.3);
    longStall(12.5);
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenCalledTimes(2);
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenLastCalledWith("720", "360", expect.stringMatching(/^stall_/), expect.anything());
  });

  it("review R2-M1: a step-down superseded by an angle switch: B and C sign the served 720, no unrequested step-up", async () => {
    signCopies({ "vid-1": BOTH, "vid-2": BOTH, "vid-3": BOTH });
    const base = mockSign.getMockImplementation()!;
    mockSign.mockImplementation((c: unknown, vid: string, o: { rendition: string }) =>
      vid === "vid-1" && o.rendition === "360" ? new Promise(() => undefined) : base(c, vid, o),
    );
    const { result } = await open();
    longStall(10.25);
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenCalledTimes(1);
    act(() => result.current.switchAngle("vid-2", 12));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/vid-2.720.mp4" }));
    expect(mockSign).toHaveBeenCalledWith({}, "vid-2", { rendition: "720" });
    ready();
    time(12.05);
    act(() => result.current.switchAngle("vid-3", 13));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/vid-3.720.mp4" }));
    expect(mockSign).toHaveBeenCalledWith({}, "vid-3", { rendition: "720" });
    expect(mockSign).not.toHaveBeenCalledWith({}, "vid-2", { rendition: "360" });
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenCalledTimes(1);
  });

  it("review R2-L1: a restore whose URL expired re-signs behind the held frame (no poster flash)", async () => {
    signCopies({ "vid-1": BOTH });
    const base = mockSign.getMockImplementation()!;
    mockSign.mockImplementation((c: unknown, vid: string, o: { rendition: string }) =>
      o.rendition === "360" ? Promise.resolve({ ok: false, error: { code: "UNKNOWN", message: "down" } }) : base(c, vid, o),
    );
    const { result } = await open();
    // The restore's swap of the old (expired) URL is rejected by the player.
    player().replaceAsync.mockImplementationOnce(() => Promise.reject(new Error("403 expired")));
    longStall(10.25);
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(3));
    expect(result.current.phase).toBe("ready");
    expect(result.current.source?.holdFrame).toBe(true);
    expect(result.current.frameShown).toBe(true);
    ready();
    expect(player().seeks.at(-1)).toBe(10.25);
  });

  it("review M3: pausing during a long stall never steps down (telemetry closes the stall on pause)", async () => {
    signCopies({ "vid-1": BOTH });
    mockTelemetry.playIntent.mockImplementation((want: boolean) => {
      if (!want) mockStallListeners.forEach((cb) => cb({ kind: "end", at: clock }));
    });
    const { result } = await open();
    stall("start");
    clock += 1500;
    act(() => result.current.toggle());
    expect(result.current.playing).toBe(false);
    expect(mockTelemetry.qualitySwitchStarted).not.toHaveBeenCalled();
    mockTelemetry.playIntent.mockImplementation(() => undefined);
  });

  it("review M3: seeking during a long stall never steps down (telemetry closes the stall on seek)", async () => {
    signCopies({ "vid-1": BOTH });
    mockTelemetry.seekRequested.mockImplementation(() => {
      mockStallListeners.forEach((cb) => cb({ kind: "end", at: clock }));
    });
    const { result } = await open();
    stall("start");
    clock += 1500;
    act(() => result.current.seek(50));
    expect(mockTelemetry.qualitySwitchStarted).not.toHaveBeenCalled();
    mockTelemetry.seekRequested.mockImplementation(() => undefined);
  });

  it("a 3G start at 360 steps up after 30 s smooth once the phone is on Wi-Fi", async () => {
    signCopies({ "vid-1": BOTH });
    const net = require("@/lib/video/quality/network-store");
    net.__resetNetworkStoreForTests({ type: "cellular", details: { cellularGeneration: "3g" } });
    await open();
    expect(mockSign).toHaveBeenLastCalledWith({}, "vid-1", { rendition: "360" });
    act(() => net.__setNetworkForTests({ type: "wifi", details: null }));
    for (let t = 0; t < 200 && !mockTelemetry.qualitySwitchStarted.mock.calls.length; t += 1) {
      clock += 250;
      time(10.25 + t * 0.25);
    }
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenCalledWith("360", "720", "smooth", expect.anything());
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/vid-1.720.mp4" }));
    expect(mockTelemetry.switchStarted).not.toHaveBeenCalled();
  });

  // Owner requirement 2026-10-06: only move between copies that exist.
  const COMBOS: Array<[string, Avail]> = [
    ["720+360", BOTH],
    ["720 only", ONLY720],
    ["360 only", ONLY360],
    ["original only", NONE],
  ];
  const PREFS: Array<[string, string]> = [
    ["auto", "wifi"],
    ["auto", "3g"],
    ["high", "wifi"],
    ["data_saver", "wifi"],
  ];
  for (const [name, copies] of COMBOS) {
    for (const [pref, net] of PREFS) {
      it(`${name}, ${pref} on ${net}: swaps only to a copy that exists`, async () => {
        signCopies({ "vid-1": copies });
        require("@/lib/video/quality/preference").__resetPlaybackQualityPreferenceForTests(pref);
        require("@/lib/video/quality/network-store").__resetNetworkStoreForTests(
          net === "wifi" ? { type: "wifi", details: null } : { type: "cellular", details: { cellularGeneration: "3g" } },
        );
        await open();
        const target = pref === "high" ? "720" : pref === "data_saver" ? "360" : net === "wifi" ? "720" : "360";
        expect(mockSign).toHaveBeenLastCalledWith({}, "vid-1", { rendition: target });
        const served = servedFor(copies, target);
        expect(mockTelemetry.renditionAttached).toHaveBeenLastCalledWith(served, "pb1");
        // A long stall, then 10 minutes of smooth playback.
        longStall(10.25);
        stall("end");
        for (let t = 0; t < 2400 && !mockTelemetry.qualitySwitchStarted.mock.calls.length; t += 1) {
          clock += 250;
          time(10.5 + t * 0.25);
        }
        const calls = mockTelemetry.qualitySwitchStarted.mock.calls;
        if (pref !== "auto" || served === "original") {
          expect(calls).toEqual([]);
          return;
        }
        if (served === "720" && copies["360"]) expect(calls[0].slice(0, 2)).toEqual(["720", "360"]);
        // A step-up only on a step-up network (cellular_3g is not one).
        else if (served === "360" && copies["720"] && net === "wifi") expect(calls[0].slice(0, 2)).toEqual(["360", "720"]);
        else expect(calls).toEqual([]);
        for (const c of calls) expect(copies[c[1] as "720" | "360"]).toBe(true);
      });
    }
  }

  it("an angle switch from both copies to an original-only angle and back", async () => {
    signCopies({ "vid-1": BOTH, "vid-2": NONE });
    const { result } = await open();
    // To the original-only angle: no decisions there.
    act(() => result.current.switchAngle("vid-2", 12));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/vid-2.original.mp4" }));
    ready();
    time(12.1);
    expect(mockTelemetry.switchLanded).toHaveBeenCalledTimes(1);
    clock += 5000;
    longStall(12.5);
    clock += 3000;
    time(13);
    stall("end");
    expect(mockTelemetry.qualitySwitchStarted).not.toHaveBeenCalled();
    // Back to the angle with both copies: a long stall steps down again.
    act(() => result.current.switchAngle("vid-1", 13));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/vid-1.720.mp4" }));
    ready();
    time(13.1);
    expect(mockTelemetry.switchLanded).toHaveBeenCalledTimes(2);
    clock += 5000;
    longStall(13.5);
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenCalledWith("720", "360", "stall_long", expect.anything());
  });
});
