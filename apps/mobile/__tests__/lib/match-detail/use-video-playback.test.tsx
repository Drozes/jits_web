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
  error: jest.fn(),
};
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
        emit: (event: string, payload?: unknown) => listeners.filter((l) => l.event === event).forEach((l) => l.fn(payload)),
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
