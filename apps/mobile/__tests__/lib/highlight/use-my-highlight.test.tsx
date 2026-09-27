/**
 * useMyHighlight (jits-s6mi.10): signs the LIVE render once per version, keeps
 * it across refetches (so a regenerate never swaps the URL), re-signs once on
 * a player error, and refreshes progress on a return from background.
 * Plus the player's wiring: status errors, pause on blur, no AirPlay.
 */
import * as React from "react";
import { act, fireEvent, render, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

let mockFocusCleanup: (() => void) | undefined;
jest.mock("expo-router", () => {
  const R = require("react");
  return {
    useFocusEffect: (cb: () => (() => void) | undefined) => {
      R.useEffect(() => {
        mockFocusCleanup = cb() ?? undefined;
      }, [cb]);
    },
  };
});
jest.mock("lucide-react-native", () => ({ Maximize2: () => null }));
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#fff" }),
}));

let mockProgress: Record<string, unknown> | null = null;
const mockRefresh = jest.fn();
const mockUseProgress = jest.fn();
jest.mock("@jits/shared/hooks/use-highlight-progress", () => ({
  useHighlightProgress: (...a: unknown[]) => {
    mockUseProgress(...a);
    return { data: mockProgress, loading: false, error: null, refresh: mockRefresh };
  },
}));

const mockSign = jest.fn();
jest.mock("@jits/shared/api/highlights", () => ({
  signHighlightPlayback: (...a: unknown[]) => mockSign(...a),
}));

import { HIGHLIGHT_RESIGN_AFTER_MS, useMyHighlight } from "@/lib/highlight/use-my-highlight";
import { HighlightPlayer } from "@/components/match-detail/highlight/highlight-player";

function progress(version: number | null, phase = "ready") {
  return {
    matchVideoId: "v1",
    phase,
    playback:
      version === null
        ? null
        : {
            storagePath: `m/u/highlights/${version}.mp4`,
            posterPath: null,
            durationS: 30,
            version,
            segments: [],
            readyAt: "t",
          },
  };
}

function signed(version: number, url = `https://signed/${version}`) {
  return { ok: true, data: { url, posterUrl: null, version, durationS: 30 } };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProgress = null;
  mockSign.mockImplementation((_c: unknown, p: { version: number }) =>
    Promise.resolve(signed(p.version)),
  );
});

describe("useMyHighlight", () => {
  it("passes the app client and the video id to the shared hook", () => {
    renderHook(() => useMyHighlight("v1"));
    expect(mockUseProgress).toHaveBeenCalledWith({ tag: "client" }, "v1");
  });

  it("does not sign without a live version", async () => {
    mockProgress = progress(null, "rendering");
    const { result } = renderHook(() => useMyHighlight("v1"));
    await flush();
    expect(mockSign).not.toHaveBeenCalled();
    expect(result.current.source).toBeNull();
  });

  it("signs once, and keeps the source across refetches and regenerating", async () => {
    mockProgress = progress(1);
    const { result, rerender } = renderHook(() => useMyHighlight("v1"));
    await flush();
    expect(result.current.source?.url).toBe("https://signed/1");
    mockProgress = { ...progress(1, "regenerating") };
    rerender({});
    await flush();
    expect(mockSign).toHaveBeenCalledTimes(1);
    expect(result.current.source?.url).toBe("https://signed/1");
  });

  it("re-signs when the live version changes", async () => {
    mockProgress = progress(1);
    const { result, rerender } = renderHook(() => useMyHighlight("v1"));
    await flush();
    mockProgress = progress(2);
    rerender({});
    await flush();
    expect(mockSign).toHaveBeenCalledTimes(2);
    expect(result.current.source).toMatchObject({ url: "https://signed/2", version: 2 });
  });

  it("carries the poster storage key on the source (image cache key)", async () => {
    mockProgress = {
      ...progress(1),
      playback: { ...progress(1).playback!, posterPath: "m/u/highlights/1.jpg" },
    };
    const { result } = renderHook(() => useMyHighlight("v1"));
    await flush();
    expect(result.current.source?.posterPath).toBe("m/u/highlights/1.jpg");
  });

  it("renews the signature before the 1 h URL expires", async () => {
    jest.useFakeTimers();
    try {
      mockProgress = progress(1);
      renderHook(() => useMyHighlight("v1"));
      await flush();
      expect(mockSign).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(HIGHLIGHT_RESIGN_AFTER_MS - 1);
      });
      expect(mockSign).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      await flush();
      expect(mockSign).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a player error on an old signature re-signs even after an earlier re-sign", async () => {
    const now = jest.spyOn(Date, "now");
    try {
      now.mockReturnValue(1_000_000);
      mockProgress = progress(1);
      const { result } = renderHook(() => useMyHighlight("v1"));
      await flush();
      act(() => result.current.onPlayerError());
      await flush();
      expect(mockSign).toHaveBeenCalledTimes(2);
      now.mockReturnValue(1_000_000 + HIGHLIGHT_RESIGN_AFTER_MS + 1);
      act(() => result.current.onPlayerError());
      await flush();
      expect(mockSign).toHaveBeenCalledTimes(3);
      expect(result.current.playbackFailed).toBe(false);
    } finally {
      now.mockRestore();
    }
  });

  it("a new reloadToken (pull-to-refresh) refreshes and re-signs a failed playback", async () => {
    mockSign.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    mockProgress = progress(1);
    const { result, rerender } = renderHook(({ token }: { token: number }) => useMyHighlight("v1", token), {
      initialProps: { token: 0 },
    });
    await flush();
    expect(result.current.playbackFailed).toBe(true);
    expect(mockRefresh).not.toHaveBeenCalled();
    rerender({ token: 1 });
    await flush();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockSign).toHaveBeenCalledTimes(2);
    expect(result.current.playbackFailed).toBe(false);
    expect(result.current.source?.url).toBe("https://signed/1");
  });

  it("reload with a fresh, working signature only refreshes progress", async () => {
    mockProgress = progress(1);
    const { result } = renderHook(() => useMyHighlight("v1"));
    await flush();
    act(() => result.current.reload());
    await flush();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockSign).toHaveBeenCalledTimes(1);
  });

  it("re-signs ONCE on a player error, then reports playback failed", async () => {
    mockProgress = progress(1);
    const { result } = renderHook(() => useMyHighlight("v1"));
    await flush();
    const firstGeneration = result.current.source?.generation;
    act(() => result.current.onPlayerError());
    await flush();
    expect(mockSign).toHaveBeenCalledTimes(2);
    expect(result.current.source?.generation).not.toBe(firstGeneration);
    expect(result.current.playbackFailed).toBe(false);
    act(() => result.current.onPlayerError());
    await flush();
    expect(mockSign).toHaveBeenCalledTimes(2);
    expect(result.current.playbackFailed).toBe(true);
  });

  it("reports playback failed when signing fails (e.g. VIDEO_FILE_MISSING)", async () => {
    mockSign.mockResolvedValue({ ok: false, error: { code: "VIDEO_FILE_MISSING", message: "x" } });
    mockProgress = progress(1);
    const { result } = renderHook(() => useMyHighlight("v1"));
    await flush();
    expect(result.current.source).toBeNull();
    expect(result.current.playbackFailed).toBe(true);
  });

  it("drops a sign result that lands after unmount", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockSign.mockReturnValue(new Promise((r) => (resolve = r)));
    mockProgress = progress(1);
    const { unmount } = renderHook(() => useMyHighlight("v1"));
    unmount();
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => resolve(signed(1)));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("refreshes on a return from background, not on inactive", () => {
    const handlers: ((s: string) => void)[] = [];
    const original = AppState.addEventListener;
    AppState.addEventListener = ((_e: unknown, h: (s: string) => void) => {
      handlers.push(h);
      return { remove: jest.fn() };
    }) as never;
    try {
      renderHook(() => useMyHighlight("v1"));
      const emit = (s: string) => handlers.forEach((h) => h(s));
      emit("inactive");
      emit("active");
      expect(mockRefresh).not.toHaveBeenCalled();
      emit("background");
      emit("active");
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    } finally {
      AppState.addEventListener = original;
    }
  });
});

describe("HighlightPlayer", () => {
  const SOURCE = { url: "https://signed/1", posterUrl: "https://p", posterPath: "m/u/highlights/1.jpg", version: 1, durationS: 30, generation: 0 };

  it("sets up a muted, looping player with external playback off, no PiP, no native controls", () => {
    const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
    const view = utils.getByTestId("expo-video-view");
    const player = view.props.player;
    expect(player.muted).toBe(true);
    expect(player.loop).toBe(true);
    expect(player.allowsExternalPlayback).toBe(false);
    expect(player.play).not.toHaveBeenCalled(); // no autoplay
    expect(view.props.allowsPictureInPicture).toBe(false);
    expect(view.props.nativeControls).toBe(false);
    expect(view.props.contentFit).toBe("contain");
  });

  it("toggles play/pause on tap and hides the poster after the first frame", () => {
    const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
    const player = utils.getByTestId("expo-video-view").props.player;
    expect(utils.getByTestId("highlight-poster")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Your highlight reel, 30 seconds"));
    expect(player.play).toHaveBeenCalledTimes(1);
    fireEvent.press(utils.getByLabelText("Your highlight reel, 30 seconds"));
    expect(player.pause).toHaveBeenCalledTimes(1);
    act(() => utils.getByTestId("expo-video-view").props.onFirstFrameRender());
    expect(utils.queryByTestId("highlight-poster")).toBeNull();
  });

  it("reports a player status error", () => {
    const onError = jest.fn();
    const utils = render(<HighlightPlayer source={SOURCE} onError={onError} />);
    const player = utils.getByTestId("expo-video-view").props.player;
    act(() => player.emitStatus({ status: "readyToPlay" }));
    expect(onError).not.toHaveBeenCalled();
    act(() => player.emitStatus({ status: "error", error: { message: "403" } }));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("pauses when the screen loses focus", () => {
    const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
    const player = utils.getByTestId("expo-video-view").props.player;
    player.play();
    mockFocusCleanup?.();
    expect(player.pause).toHaveBeenCalled();
  });

  it("offers native fullscreen", () => {
    const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
    expect(utils.getByLabelText("Watch full screen")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Watch full screen"));
  });
});
