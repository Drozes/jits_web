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

  it("never re-signs on a timer (a renewal must not interrupt playback)", async () => {
    jest.useFakeTimers();
    try {
      mockProgress = progress(1);
      renderHook(() => useMyHighlight("v1"));
      await flush();
      expect(mockSign).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(HIGHLIGHT_RESIGN_AFTER_MS * 3);
      });
      await flush();
      expect(mockSign).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("re-signs on return from background only when the signature is stale", async () => {
    const handlers: ((s: string) => void)[] = [];
    const original = AppState.addEventListener;
    AppState.addEventListener = ((_e: unknown, h: (s: string) => void) => {
      handlers.push(h);
      return { remove: jest.fn() };
    }) as never;
    const now = jest.spyOn(Date, "now");
    try {
      now.mockReturnValue(5_000_000);
      mockProgress = progress(1);
      renderHook(() => useMyHighlight("v1"));
      await flush();
      const cycle = async () => {
        await act(async () => {
          handlers.forEach((h) => h("background"));
          handlers.forEach((h) => h("active"));
        });
        await flush();
      };
      await cycle();
      expect(mockSign).toHaveBeenCalledTimes(1);
      now.mockReturnValue(5_000_000 + HIGHLIGHT_RESIGN_AFTER_MS);
      await cycle();
      expect(mockSign).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
      AppState.addEventListener = original;
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

  it("swaps a re-signed URL into the SAME player and view, keeping position and play state", async () => {
    const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
    const view = utils.getByTestId("expo-video-view");
    const player = view.props.player;
    act(() => view.props.onFirstFrameRender());
    player.play();
    player.currentTime = 12.5;
    utils.rerender(
      <HighlightPlayer source={{ ...SOURCE, url: "https://signed/1-renewed", generation: 1 }} onError={jest.fn()} />,
    );
    await flush();
    expect(player.replaceAsync).toHaveBeenCalledWith("https://signed/1-renewed");
    expect(utils.getByTestId("expo-video-view")).toBe(view);
    expect(utils.getByTestId("expo-video-view").props.player).toBe(player);
    expect(player.currentTime).toBe(12.5);
    expect(player.playing).toBe(true);
    // Same version: no poster flash over the frame.
    expect(utils.queryByTestId("highlight-poster")).toBeNull();
  });

  it("reloads an identical URL in place when the generation changes (re-sign after an error)", async () => {
    const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
    const player = utils.getByTestId("expo-video-view").props.player;
    utils.rerender(<HighlightPlayer source={{ ...SOURCE, generation: 1 }} onError={jest.fn()} />);
    await flush();
    expect(player.replaceAsync).toHaveBeenCalledWith(SOURCE.url);
  });

  it("a new version swaps in place from the top and shows its poster until it renders", async () => {
    const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
    const view = utils.getByTestId("expo-video-view");
    const player = view.props.player;
    act(() => view.props.onFirstFrameRender());
    player.currentTime = 20;
    utils.rerender(
      <HighlightPlayer
        source={{ ...SOURCE, url: "https://signed/2", posterUrl: "https://p2", version: 2, generation: 1 }}
        onError={jest.fn()}
      />,
    );
    await flush();
    expect(player.replaceAsync).toHaveBeenCalledWith("https://signed/2");
    expect(player.currentTime).toBe(0);
    expect(utils.getByTestId("expo-video-view")).toBe(view);
    expect(utils.getByTestId("highlight-poster")).toBeTruthy();
  });

  it("reports a failed in-place swap as a player error", async () => {
    const onError = jest.fn();
    const utils = render(<HighlightPlayer source={SOURCE} onError={onError} />);
    const player = utils.getByTestId("expo-video-view").props.player;
    player.replaceAsync.mockRejectedValueOnce(new Error("load failed"));
    utils.rerender(<HighlightPlayer source={{ ...SOURCE, url: "https://x", generation: 1 }} onError={onError} />);
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  /** Make the next replaceAsync calls resolve/reject by hand. */
  function deferSwaps(player: { replaceAsync: jest.Mock; source: string }) {
    const pending: { url: string; resolve: () => void; reject: (e: Error) => void }[] = [];
    player.replaceAsync.mockImplementation(
      (url: string) =>
        new Promise<void>((resolve, reject) => {
          pending.push({
            url,
            resolve: () => {
              player.source = url; // the native item is whichever finished last
              resolve();
            },
            reject,
          });
        }),
    );
    return pending;
  }

  it("ignores a superseded swap and re-issues the latest URL when the stale one finishes last", async () => {
    const onError = jest.fn();
    const utils = render(<HighlightPlayer source={SOURCE} onError={onError} />);
    const player = utils.getByTestId("expo-video-view").props.player;
    const pending = deferSwaps(player);
    player.play();
    player.currentTime = 8;
    utils.rerender(<HighlightPlayer source={{ ...SOURCE, url: "https://a", generation: 1 }} onError={onError} />);
    utils.rerender(<HighlightPlayer source={{ ...SOURCE, url: "https://b", generation: 2 }} onError={onError} />);
    expect(pending.map((p) => p.url)).toEqual(["https://a", "https://b"]);
    // Latest finishes first and applies its restore...
    await act(async () => pending[1].resolve());
    expect(player.play).toHaveBeenCalledTimes(2);
    // ...then the stale one finishes last: its restore is ignored and the
    // latest URL is loaded again so the item is not left on the stale URL.
    player.currentTime = 3;
    await act(async () => pending[0].resolve());
    expect(player.currentTime).toBe(3);
    expect(pending.map((p) => p.url)).toEqual(["https://a", "https://b", "https://b"]);
    await act(async () => pending[2].resolve());
    expect(player.source).toBe("https://b");
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignores a stale swap that fails, and anything settling after unmount", async () => {
    const onError = jest.fn();
    const utils = render(<HighlightPlayer source={SOURCE} onError={onError} />);
    const player = utils.getByTestId("expo-video-view").props.player;
    const pending = deferSwaps(player);
    utils.rerender(<HighlightPlayer source={{ ...SOURCE, url: "https://a", generation: 1 }} onError={onError} />);
    utils.rerender(<HighlightPlayer source={{ ...SOURCE, url: "https://b", generation: 2 }} onError={onError} />);
    await act(async () => pending[0].reject(new Error("stale failed")));
    expect(onError).not.toHaveBeenCalled();
    utils.unmount();
    await act(async () => pending[1].reject(new Error("late")));
    expect(onError).not.toHaveBeenCalled();
    expect(pending).toHaveLength(2);
  });

  /** Fire the fake player's playingChange listeners (the setup mock only has emitStatus). */
  function emitPlaying(player: { addListener: jest.Mock }, isPlaying: boolean) {
    for (const [event, fn] of player.addListener.mock.calls) {
      if (event === "playingChange") (fn as (p: { isPlaying: boolean }) => void)({ isPlaying });
    }
  }

  it("readyToPlay alone keeps the poster (a paused, never-played item renders black)", () => {
    const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
    const player = utils.getByTestId("expo-video-view").props.player;
    act(() => player.emitStatus({ status: "readyToPlay" }));
    expect(utils.getByTestId("highlight-poster")).toBeTruthy();
  });

  it("readyToPlay hides the poster only once playback has started for that version (no onFirstFrameRender)", async () => {
    const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
    const player = utils.getByTestId("expo-video-view").props.player;
    act(() => player.emitStatus({ status: "readyToPlay" }));
    act(() => emitPlaying(player, true));
    expect(utils.queryByTestId("highlight-poster")).toBeNull();
    // A new version shows its poster again until IT has rendered.
    const pending = deferSwaps(player);
    utils.rerender(
      <HighlightPlayer source={{ ...SOURCE, url: "https://v2", version: 2, generation: 1 }} onError={jest.fn()} />,
    );
    expect(utils.getByTestId("highlight-poster")).toBeTruthy();
    // Events while the swap is still pending are about the OLD item.
    act(() => player.emitStatus({ status: "readyToPlay" }));
    act(() => emitPlaying(player, true));
    expect(utils.getByTestId("highlight-poster")).toBeTruthy();
    await act(async () => pending[0].resolve());
    act(() => player.emitStatus({ status: "readyToPlay" }));
    expect(utils.getByTestId("highlight-poster")).toBeTruthy(); // ready, but not played yet
    act(() => emitPlaying(player, true));
    expect(utils.queryByTestId("highlight-poster")).toBeNull();
  });

  it("a first-frame event while a new version's swap is pending does not hide its poster", async () => {
    const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
    const view = utils.getByTestId("expo-video-view");
    const player = view.props.player;
    const pending = deferSwaps(player);
    utils.rerender(
      <HighlightPlayer source={{ ...SOURCE, url: "https://v2", version: 2, generation: 1 }} onError={jest.fn()} />,
    );
    act(() => utils.getByTestId("expo-video-view").props.onFirstFrameRender()); // the old item
    expect(utils.getByTestId("highlight-poster")).toBeTruthy();
    await act(async () => pending[0].resolve());
    act(() => utils.getByTestId("expo-video-view").props.onFirstFrameRender());
    expect(utils.queryByTestId("highlight-poster")).toBeNull();
  });

  describe("fullscreen always has native controls (simulator B1)", () => {
    const mockVideoHandle = {
      set current(h: { enterFullscreen: () => Promise<void> } | null) {
        (globalThis as { __expoVideoHandle?: unknown }).__expoVideoHandle = h;
      },
    };
    let raf: jest.SpyInstance;
    beforeEach(() => {
      raf = jest.spyOn(global, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    });
    afterEach(() => {
      raf.mockRestore();
      mockVideoHandle.current = null;
    });

    function enterSpy(utils: ReturnType<typeof render>) {
      // The fake VideoView's imperative handle is created per render; grab it via the ref'd instance.
      return utils.getByTestId("expo-video-view");
    }

    it("turns nativeControls on BEFORE calling enterFullscreen, and off again on exit", async () => {
      const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
      expect(enterSpy(utils).props.nativeControls).toBe(false);
      const calls: boolean[] = [];
      const handle = { enterFullscreen: jest.fn(() => {
        calls.push(utils.getByTestId("expo-video-view").props.nativeControls);
        return Promise.resolve();
      }) };
      mockVideoHandle.current = handle;
      await act(async () => {
        fireEvent.press(utils.getByLabelText("Watch full screen"));
      });
      expect(handle.enterFullscreen).toHaveBeenCalledTimes(1);
      expect(calls).toEqual([true]); // controls were already committed when fullscreen was entered
      act(() => utils.getByTestId("expo-video-view").props.onFullscreenEnter());
      expect(utils.getByTestId("expo-video-view").props.nativeControls).toBe(true);
      act(() => utils.getByTestId("expo-video-view").props.onFullscreenExit());
      expect(utils.getByTestId("expo-video-view").props.nativeControls).toBe(false);
    });

    it("any other way into fullscreen also turns the controls on", () => {
      const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
      act(() => utils.getByTestId("expo-video-view").props.onFullscreenEnter());
      expect(utils.getByTestId("expo-video-view").props.nativeControls).toBe(true);
    });

    it("a failed enterFullscreen turns the controls back off", async () => {
      const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
      mockVideoHandle.current = { enterFullscreen: jest.fn(() => Promise.reject(new Error("no"))) };
      await act(async () => {
        fireEvent.press(utils.getByLabelText("Watch full screen"));
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(utils.getByTestId("expo-video-view").props.nativeControls).toBe(false);
    });

    it("fullscreen is enabled on the card and disabled where the button is hidden (the viewer)", () => {
      const card = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
      expect(card.getByTestId("expo-video-view").props.fullscreenOptions).toEqual({ enable: true });
      card.unmount();
      const viewer = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} showFullscreenButton={false} />);
      expect(viewer.getByTestId("expo-video-view").props.fullscreenOptions).toEqual({ enable: false });
      expect(viewer.queryByLabelText("Watch full screen")).toBeNull();
    });
  });

  it("offers native fullscreen", () => {
    const utils = render(<HighlightPlayer source={SOURCE} onError={jest.fn()} />);
    expect(utils.getByLabelText("Watch full screen")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Watch full screen"));
  });
});
