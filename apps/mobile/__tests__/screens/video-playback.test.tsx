import * as React from "react";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";

// ---- mocks ----

const mockBack = jest.fn();
const mockReplace = jest.fn();

const mockSetParams = jest.fn();
let mockId: string | undefined = "vid-1";
let mockT: string | undefined;
let mockApprox: string | undefined;

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: mockId, t: mockT, approx: mockApprox }),
  useRouter: () => ({ back: mockBack, replace: mockReplace, setParams: mockSetParams, canGoBack: () => true }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: unknown, prop: string) => (prop === "__esModule" ? true : stub) });
});

// The match (names, other angle) and the breakdown are separate reads.
const mockUseMatchDetail = jest.fn();
jest.mock("@/lib/match-detail/use-match-detail", () => ({
  useMatchDetail: (id: string | undefined) => mockUseMatchDetail(id),
}));
const mockGetVideoAnalysis = jest.fn();
jest.mock("@jits/shared/api/film-room", () => ({
  getVideoAnalysis: (...a: unknown[]) => mockGetVideoAnalysis(...a),
}));

/**
 * A fake expo-video player per screen instance. `replaceAsync` records the
 * URL each sign hands it; a test drives the player's own events (status,
 * time, end) and reads back seeks (currentTime writes), play/pause and rate.
 */
type Listener = { event: string; fn: (payload?: any) => void };
interface FakePlayer {
  source: { uri: string } | null;
  status: string;
  playing: boolean;
  duration: number;
  playbackRate: number;
  seeks: number[];
  currentTime: number;
  play: jest.Mock;
  pause: jest.Mock;
  replaceAsync: jest.Mock;
  addListener: jest.Mock;
  emit: (event: string, payload?: unknown) => void;
  /** The hook mount that created it (players made in one render share it): one screen's slot players. */
  screen: number;
}
const mockPlayers: FakePlayer[] = [];
/** The front view's props ("video-player"), while it is mounted. */
const mockViewProps: { current: Record<string, any> | null } = { current: null };
/** Every mounted view's latest props by testID ("video-player", "video-player-incoming"). */
const mockViewPropsById: Record<string, Record<string, any>> = {};
const mockViewMounts = { count: 0 };
/** Players created in one synchronous render belong to one screen (the hook's two slot players). */
const mockScreens = { id: 0, open: false };

jest.mock("expo-video", () => {
  const R = require("react");
  const RN = require("react-native");
  function createPlayer(): FakePlayer {
    const listeners: Listener[] = [];
    let time = 0;
    const p = {
      screen: 0,
      source: null,
      status: "idle",
      playing: false,
      duration: 0,
      playbackRate: 1,
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
      replaceAsync: jest.fn((src: { uri: string } | null) => {
        p.source = src;
        // null clears the item (the engine releases a slot this way).
        p.status = src == null ? "idle" : "loading";
        if (src == null) p.playing = false;
        return Promise.resolve();
      }),
      addListener: jest.fn((event: string, fn: (payload?: unknown) => void) => {
        const entry = { event, fn };
        listeners.push(entry);
        return { remove: () => listeners.splice(listeners.indexOf(entry), 1) };
      }),
      emit: (event: string, payload?: unknown) => {
        // The native clock follows its own time updates (a seek still records).
        if (event === "timeUpdate") time = (payload as { currentTime: number }).currentTime;
        listeners.filter((l) => l.event === event).forEach((l) => l.fn(payload));
      },
    } as FakePlayer;
    return p;
  }
  function useVideoPlayer(_source: unknown, setup?: (p: FakePlayer) => void) {
    const ref = R.useRef(null);
    if (!ref.current) {
      if (!mockScreens.open) {
        mockScreens.id += 1;
        mockScreens.open = true;
        queueMicrotask(() => {
          mockScreens.open = false;
        });
      }
      ref.current = createPlayer();
      ref.current.screen = mockScreens.id;
      mockPlayers.push(ref.current);
      setup?.(ref.current);
    }
    return ref.current;
  }
  function VideoView(props: Record<string, any>) {
    mockViewPropsById[props.testID] = props;
    if (props.testID === "video-player") mockViewProps.current = props;
    const player = props.player;
    R.useEffect(() => {
      mockViewMounts.count += 1;
      return () => {
        if (mockViewProps.current?.player === player) mockViewProps.current = null;
      };
    }, [player]);
    return R.createElement(RN.Text, { testID: props.testID }, props.player.source?.uri ?? "");
  }
  // For tests that hand the screen their own slot players (not counted in mockPlayers).
  return { useVideoPlayer, VideoView, __createPlayer: createPlayer };
});

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

const mockCaptureMessage = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
}));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: jest.fn(async () => ({ type: "wifi", details: null })) },
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "light",
  useThemedTokens: () => ({ accentCta: "#E63946" }),
}));

jest.mock("@/components/layout/app-header", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    AppHeader: ({ title }: { title: string }) =>
      R.createElement(RN.Text, { testID: "app-header" }, title),
  };
});

jest.mock("@jits/shared/api/queries", () => ({
  getMatchVideoSignedUrl: jest.fn(),
  getMatchVideoSignedUrlResult: jest.fn(),
  getMatchVideoPlaybackResult: jest.fn(),
}));

// Timing is the screen's (pill delay, minimum, fade timers), not the animation runtime's.
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

// The held still is an expo-image of a native thumbnail.
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: { testID?: string }) => R.createElement(RN.View, { testID: props.testID }) };
});

/**
 * The real playback hook drives the player; slice B1 (jits-xfvd.16) drives
 * its `switchState`. The screen's switch UI is tested here by setting
 * `mockSwitchState` (null: the hook's own), and every `switchAngle` call is
 * recorded with its options.
 */
let mockSwitchState: Record<string, unknown> | null = null;
/** Other members of the hook's result to override (for example `phase`). */
let mockPlaybackPatch: Record<string, unknown> | null = null;
const mockSwitchCalls: unknown[][] = [];
/** Records the screen's `telemetry.switchTapIgnored()` calls (the lock's ignored taps). */
const mockTapIgnored = jest.fn();
const mockTelemetries = new WeakMap<object, object>();
jest.mock("@/lib/match-detail/use-video-playback", () => {
  const actual = jest.requireActual("@/lib/match-detail/use-video-playback");
  return {
    ...actual,
    useVideoPlayback: (...a: unknown[]) => {
      const real = actual.useVideoPlayback(...a);
      const switchAngle = (...args: unknown[]) => {
        mockSwitchCalls.push(args);
        real.switchAngle(...args);
      };
      // One wrapped telemetry per real one, so the screen's effects keyed on it stay stable.
      const telemetry: object = mockTelemetries.get(real.telemetry) ?? {
        ...real.telemetry,
        switchTapIgnored: () => {
          mockTapIgnored();
          real.telemetry.switchTapIgnored();
        },
      };
      mockTelemetries.set(real.telemetry, telemetry);
      return { ...real, telemetry, switchAngle, ...(mockSwitchState ? { switchState: mockSwitchState } : {}), ...(mockPlaybackPatch ?? {}) };
    },
  };
});

import { AccessibilityInfo } from "react-native";
import { IDLE_SWITCH_STATE } from "@/lib/match-detail/use-video-playback";
import MatchVideoScreen from "@/app/(app)/video/[id]";

interface QueryMocks {
  getMatchVideoSignedUrl: jest.Mock;
  getMatchVideoSignedUrlResult: jest.Mock;
  getMatchVideoPlaybackResult: jest.Mock;
}

function queries() {
  return require("@jits/shared/api/queries") as QueryMocks;
}

function playable(url: string, posterUrl: string | null = null) {
  return {
    ok: true,
    data: { url, posterUrl, status: "ready", playability: "playable" },
  };
}

/**
 * The latest screen's FRONT player: the one the "video-player" view shows,
 * else (before it renders) the first slot player of the latest screen. With
 * one player per screen (in_place only) that is simply the last one made.
 */
function lastPlayer() {
  const front = mockViewProps.current?.player as FakePlayer | undefined;
  if (front && mockPlayers.includes(front)) return front;
  const latest = mockPlayers[mockPlayers.length - 1];
  return latest ? mockPlayers.find((p) => p.screen === latest.screen)! : latest;
}

/** How many screens (hook mounts) made players: one per screen, however many slots each has. */
function screensMade() {
  return new Set(mockPlayers.map((p) => p.screen)).size;
}

/** Every URL swapped into `p` (releases, replaceAsync(null), are left out). */
function replacedUrls(p = lastPlayer()) {
  return p.replaceAsync.mock.calls.filter((c) => c[0] != null).map((c) => (c[0] as { uri: string }).uri);
}

/** The latest screen's incoming slot player (the "video-player-incoming" view's), else its second slot. */
function incomingPlayer(): FakePlayer {
  const view = mockViewPropsById["video-player-incoming"]?.player as FakePlayer | undefined;
  if (view && mockPlayers.includes(view)) return view;
  const front = lastPlayer();
  return mockPlayers.find((p) => p.screen === front.screen && p !== front)!;
}

/** Player `p`'s item is ready (duration seconds). */
function readyOn(p: FakePlayer, duration = 400) {
  act(() => {
    p.status = "readyToPlay";
    p.duration = duration;
    p.emit("statusChange", { status: "readyToPlay" });
  });
}

/** Player `p` reports its time. */
function timeOn(p: FakePlayer, seconds: number) {
  act(() => {
    p.emit("timeUpdate", { currentTime: seconds, bufferedPosition: seconds, currentLiveTimestamp: null, currentOffsetFromLive: null });
  });
}

function stateLabel(utils: ReturnType<typeof render>) {
  // Exactly one element carries the id, and it must be a real accessibility
  // element: idb (the harness) never sees a testID on a non-accessible View.
  const markers = utils.getAllByTestId("video-player-state");
  expect(markers).toHaveLength(1);
  expect(markers[0].props.accessible).toBe(true);
  return markers[0].props.accessibilityLabel;
}

/** The swapped-in item is ready (duration in seconds). */
function ready(duration = 0) {
  act(() => {
    const p = lastPlayer();
    p.status = "readyToPlay";
    p.duration = duration;
    p.emit("statusChange", { status: "readyToPlay" });
  });
}

function timeTo(seconds: number) {
  act(() => {
    lastPlayer().emit("timeUpdate", { currentTime: seconds, bufferedPosition: seconds, currentLiveTimestamp: null, currentOffsetFromLive: null });
  });
}

/** Load (the resume seek lands), then real playback progress to `seconds`. */
function loadAndPlayTo(seconds: number) {
  ready();
  timeTo(lastPlayer().seeks.at(-1) ?? 0);
  timeTo(seconds);
}

async function playerError(message = "player error") {
  await act(async () => {
    const p = lastPlayer();
    p.status = "error";
    p.emit("statusChange", { status: "error", error: { message } });
  });
}

/** An error, then the silent re-sign's swap (`count` swaps in total). */
async function playerErrors(count: number) {
  await playerError();
  await waitFor(() => expect(lastPlayer().replaceAsync).toHaveBeenCalledTimes(count + 1));
}

/** The angle lock has released: every chip is enabled again (the switch settled to idle). */
async function unlocked(utils: ReturnType<typeof render>) {
  await waitFor(() => {
    for (const chip of utils.getAllByRole("tab")) expect(chip.props.accessibilityState?.disabled).toBeFalsy();
    expect(utils.queryAllByRole("tab").some((chip) => chip.props.accessibilityState?.busy)).toBe(false);
  });
}

/** The first sign's swap has reached the player. */
async function swapped(count = 1) {
  await waitFor(() => expect(lastPlayer()?.replaceAsync).toHaveBeenCalledTimes(count));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayers.length = 0;
  mockViewProps.current = null;
  mockViewMounts.count = 0;
  for (const k of Object.keys(mockViewPropsById)) delete mockViewPropsById[k];
  mockId = "vid-1";
  mockT = undefined;
  mockApprox = undefined;
  mockSwitchState = null;
  mockSwitchCalls.length = 0;
  mockPlaybackPatch = null;
  // The route follows setParams, like expo-router (tests rerender to apply it).
  mockSetParams.mockImplementation((p: { id?: string }) => {
    if (p.id) mockId = p.id;
  });
  mockUseMatchDetail.mockReturnValue({ state: "loading", data: null, error: null, refreshing: false, refetch: jest.fn() });
  mockGetVideoAnalysis.mockResolvedValue({ ok: true, data: null });
  mockCaptureMessage.mockReset();
});

/**
 * Every failure below is a RESOLVED `{ ok: false }`, never a rejection:
 * supabase-js does not reject, so a mockRejectedValue here would exercise a
 * path production cannot produce (jits-icei.5).
 */
describe("MatchVideoScreen", () => {
  it("plays the signed URL on expo-video and reports loaded once the item is ready", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue(
      playable("https://signed.example/v.mp4"),
    );

    const utils = render(React.createElement(MatchVideoScreen));
    await swapped();
    expect(replacedUrls()).toEqual(["https://signed.example/v.mp4"]);
    await waitFor(() => expect(utils.getByTestId("video-player")).toBeTruthy());
    expect(stateLabel(utils)).toBe("Video state: loading");
    // Nothing plays before the item is ready (a seek on an unready item is lost).
    expect(lastPlayer().play).not.toHaveBeenCalled();

    ready(400);
    expect(stateLabel(utils)).toBe("Video state: loaded");
    // Autoplay, no native controls, no PiP.
    expect(lastPlayer().play).toHaveBeenCalled();
    expect(mockViewProps.current!.nativeControls).toBe(false);
    expect(mockViewProps.current!.contentFit).toBe("contain");
  });

  it("reports loaded when readyToPlay fired before the swap settled", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue(playable("https://signed.example/v.mp4"));
    let resolveSwap!: () => void;
    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(screensMade()).toBe(1));
    lastPlayer().replaceAsync.mockImplementationOnce((src: { uri: string }) => {
      lastPlayer().source = src;
      return new Promise<void>((r) => (resolveSwap = r));
    });
    await swapped();
    ready();
    // The native item may still be the old one: not loaded yet.
    expect(stateLabel(utils)).toBe("Video state: loading");
    await act(async () => resolveSwap());
    expect(stateLabel(utils)).toBe("Video state: loaded");
  });

  it("reads through the playback Result query, not the older wrappers", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue(
      playable("https://signed.example/v.mp4"),
    );

    render(React.createElement(MatchVideoScreen));
    await waitFor(() => {
      expect(queries().getMatchVideoPlaybackResult).toHaveBeenCalledWith({}, "vid-1", { rendition: "720" });
    });
    expect(queries().getMatchVideoSignedUrl).not.toHaveBeenCalled();
    expect(queries().getMatchVideoSignedUrlResult).not.toHaveBeenCalled();
  });

  it("covers the frame with the signed poster until the first frame renders", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue(
      playable("https://signed.example/v.mp4", "https://signed.example/p.jpg"),
    );

    const utils = render(React.createElement(MatchVideoScreen));
    await swapped();
    await waitFor(() => expect(utils.getByTestId("video-poster")).toBeTruthy());
    expect(utils.getByTestId("video-poster").props.source).toEqual({ uri: "https://signed.example/p.jpg" });
    ready();
    act(() => mockViewProps.current!.onFirstFrameRender());
    expect(utils.queryByTestId("video-poster")).toBeNull();
  });

  it("lifts the poster once playback moves, even without onFirstFrameRender", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue(
      playable("https://signed.example/v.mp4", "https://signed.example/p.jpg"),
    );
    const utils = render(React.createElement(MatchVideoScreen));
    await swapped();
    ready();
    expect(utils.getByTestId("video-poster")).toBeTruthy();
    timeTo(0.5);
    expect(utils.queryByTestId("video-poster")).toBeNull();
  });

  it("shows the unavailable state when no row is visible", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue({ ok: true, data: null });

    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(utils.getByTestId("video-unavailable")).toBeTruthy());
    expect(stateLabel(utils)).toBe("Video state: absent");
    fireEvent.press(utils.getByLabelText("Back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("does not load the player while the recording is still uploading", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue({
      ok: true,
      data: { url: "https://x/v.mp4", posterUrl: null, status: "uploading", playability: "processing" },
    });

    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(utils.getByTestId("video-processing")).toBeTruthy());
    expect(utils.queryByTestId("video-player")).toBeNull();
    expect(lastPlayer().replaceAsync).not.toHaveBeenCalled();
    expect(stateLabel(utils)).toBe("Video state: processing");
  });

  it("shows file-missing, not the retry panel, when storage has no object", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue({
      ok: false,
      error: { code: "VIDEO_FILE_MISSING", message: "The video file was not found." },
    });

    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(utils.getByTestId("video-file-missing")).toBeTruthy());
    expect(utils.queryByTestId("video-load-failed")).toBeNull();
    expect(stateLabel(utils)).toBe("Video state: missing");
  });

  it("shows a retryable failure, NOT the empty state, when the read fails", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "connection failure" },
    });

    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(utils.getByTestId("video-load-failed")).toBeTruthy());
    expect(utils.queryByTestId("video-unavailable")).toBeNull();
    expect(stateLabel(utils)).toBe("Video state: error");
  });

  it("retries the read when the athlete asks", async () => {
    const mock = queries().getMatchVideoPlaybackResult;
    mock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });

    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(utils.getByTestId("video-load-failed")).toBeTruthy());

    mock.mockResolvedValue(playable("https://signed.example/v.mp4"));
    await act(async () => {
      fireEvent.press(utils.getByLabelText("Retry loading video"));
    });
    await waitFor(() => expect(utils.getByTestId("video-player")).toBeTruthy());
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("re-signs once silently on a player error and resumes where it was", async () => {
    const mock = queries().getMatchVideoPlaybackResult;
    mock.mockResolvedValueOnce(playable("https://signed.example/old.mp4"));
    mock.mockResolvedValueOnce(playable("https://signed.example/new.mp4"));

    const utils = render(React.createElement(MatchVideoScreen));
    await swapped();
    loadAndPlayTo(42);

    // The 1h URL expires mid-match.
    await playerError("expired");
    await swapped(2);
    expect(replacedUrls()).toEqual(["https://signed.example/old.mp4", "https://signed.example/new.mp4"]);
    // Same player: the new URL is swapped in, never a remount.
    expect(screensMade()).toBe(1);
    expect(utils.queryByTestId("video-load-failed")).toBeNull();
    expect(mock).toHaveBeenCalledTimes(2);
    expect(stateLabel(utils)).toBe("Video state: loading");

    lastPlayer().play.mockClear();
    ready();
    expect(lastPlayer().seeks).toEqual([42]);
    expect(lastPlayer().play).toHaveBeenCalled();
    expect(stateLabel(utils)).toBe("Video state: loaded");
  });

  it("re-signs when the swap itself rejects", async () => {
    const mock = queries().getMatchVideoPlaybackResult;
    mock.mockResolvedValue(playable("https://signed.example/v.mp4"));
    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(screensMade()).toBe(1));
    lastPlayer().replaceAsync.mockImplementationOnce(() => Promise.reject(new Error("load failed")));
    await swapped(2);
    expect(mock).toHaveBeenCalledTimes(2);
    ready();
    expect(stateLabel(utils)).toBe("Video state: loaded");
  });

  it("shows the retry panel on a second consecutive player error", async () => {
    const mock = queries().getMatchVideoPlaybackResult;
    mock.mockResolvedValue(playable("https://signed.example/v.mp4"));

    const utils = render(React.createElement(MatchVideoScreen));
    await swapped();

    await playerErrors(1);
    expect(stateLabel(utils)).toBe("Video state: loading");

    // The re-signed URL loads and seeks back, then fails at the same spot:
    // a load alone is not progress, so this must not re-sign again.
    ready();
    await playerError("bad again");
    expect(utils.getByTestId("video-load-failed")).toBeTruthy();
    expect(stateLabel(utils)).toBe("Video state: error");
    // One initial sign plus exactly one silent re-sign.
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("caps silent re-signs at two per screen, even with progress between", async () => {
    const mock = queries().getMatchVideoPlaybackResult;
    mock.mockResolvedValue(playable("https://signed.example/v.mp4"));

    const utils = render(React.createElement(MatchVideoScreen));
    await swapped();
    loadAndPlayTo(10);

    await playerErrors(1); // re-sign 1
    loadAndPlayTo(20); // real progress clears the streak
    await playerErrors(2); // re-sign 2
    loadAndPlayTo(30);
    await playerError("third");

    expect(utils.getByTestId("video-load-failed")).toBeTruthy();
    expect(mock).toHaveBeenCalledTimes(3);

    // The user's Retry resets the cap.
    await act(async () => {
      fireEvent.press(utils.getByLabelText("Retry loading video"));
    });
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(utils.getByTestId("video-player")).toBeTruthy());
    await swapped(4);
    loadAndPlayTo(35);
    await playerErrors(4);
    expect(mock).toHaveBeenCalledTimes(5);
  });

  it("ignores player errors while a silent re-sign is in flight", async () => {
    const mock = queries().getMatchVideoPlaybackResult;
    mock.mockResolvedValueOnce(playable("https://signed.example/old.mp4"));
    let resolveSign!: (v: unknown) => void;
    mock.mockReturnValueOnce(new Promise((r) => (resolveSign = r)));

    const utils = render(React.createElement(MatchVideoScreen));
    await swapped();
    loadAndPlayTo(8);

    await playerError("expired");
    // The dying item reports again before the new URL arrives.
    await playerError("expired again");
    expect(utils.queryByTestId("video-load-failed")).toBeNull();
    expect(mock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSign(playable("https://signed.example/new.mp4"));
    });
    await swapped(2);
    expect(replacedUrls()[1]).toBe("https://signed.example/new.mp4");
  });

  it("sends one playback telemetry event per viewing session, with the angle (jits-n2im.21)", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue(playableInMatch());
    mockUseMatchDetail.mockImplementation((id: string | undefined) =>
      id === MATCH ? detailView(2) : { state: "loading", data: null, error: null, refreshing: false, refetch: jest.fn() },
    );
    const utils = render(React.createElement(MatchVideoScreen));
    await swapped();
    ready(400);
    act(() => lastPlayer().emit("playingChange", { isPlaying: true }));
    timeTo(5);
    act(() => lastPlayer().emit("playingChange", { isPlaying: false }));
    expect(mockCaptureMessage).not.toHaveBeenCalled();
    utils.unmount();
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    const [message, payload] = mockCaptureMessage.mock.calls[0];
    expect(message).toBe("Video playback session");
    expect(payload.tags).toMatchObject({
      "video.playback.surface": "match",
      "video.playback.source": "normalized",
      "video.playback.network": "wifi",
    });
    expect(payload.extra).toMatchObject({ videoId: "vid-1", angle: "mine", angleCount: 2, maxPositionS: 5, startupAbandoned: false });
  });

  it("an open closed while the URL is still signing is one abandoned-startup event (M2)", async () => {
    queries().getMatchVideoPlaybackResult.mockReturnValue(new Promise(() => undefined));
    const utils = render(React.createElement(MatchVideoScreen));
    await act(async () => undefined);
    utils.unmount();
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    const payload = mockCaptureMessage.mock.calls[0][1];
    expect(payload.tags["video.playback.outcome"]).toBe("abandoned_startup");
    expect(payload.extra).toMatchObject({ startupAbandoned: true, signOutcome: "pending", signMs: null, sourceKind: null });
  });

  it("shows unavailable without a read when the route has no id", async () => {
    mockId = undefined;
    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(utils.getByTestId("video-unavailable")).toBeTruthy());
    expect(queries().getMatchVideoPlaybackResult).not.toHaveBeenCalled();
    expect(stateLabel(utils)).toBe("Video state: absent");
  });
});

// ---------------------------------------------------------------------------
// Film Room controls (match flow redesign F2)
// ---------------------------------------------------------------------------

const MATCH = "11111111-1111-4111-8111-111111111111";

function playableInMatch(url = "https://signed.example/v.mp4") {
  return {
    ok: true,
    data: { url, posterUrl: null, status: "analyzed", playability: "playable", matchId: MATCH, durationSeconds: 400, sourceKind: "normalized" },
  };
}

function detailView(videos = 2, extra: Record<string, unknown>[] = [], sync: Record<string, Record<string, unknown>> = {}) {
  const vids = [
    { id: "vid-1", uploaded_by: "me-1", uploaded_by_name: "Kai Reyes", is_mine: true, angle_label: "Your recording", playability: "playable", has_analysis: true },
    { id: "vid-2", uploaded_by: "opp-1", uploaded_by_name: "Mina Park", is_mine: false, angle_label: "Mina Park's recording", playability: "playable", has_analysis: false },
  ]
    .slice(0, videos)
    .concat(extra as never[])
    .map((v) => ({ ...v, ...(sync[v.id] ?? {}) }));
  return {
    state: "ready",
    error: null,
    refreshing: false,
    refetch: jest.fn(),
    data: {
      match: { id: MATCH, match_type: "ranked", result: "submission", submission_name: "Rear-naked choke", finish_time_seconds: 377 },
      me: { athlete_id: "me-1", display_name: "Kai Reyes" },
      opponent: { athlete_id: "opp-1", display_name: "Mina Park" },
      videos: vids,
      confirmations: [],
    },
  };
}

const ANALYSIS = {
  ok: true,
  data: {
    summary: "Reyes won.",
    analysis_tier: "premium",
    positions: [{ position: "standing", timestamp_s: 9, description: "Hand fighting." }],
    scoring_moments: [
      { type: "takedown", timestamp_s: 27, description: "Single leg to the mat" },
      { type: "guard_pass", timestamp_s: 192 },
    ],
    technique_tags: [{ id: "t1", technique_name: "Rear naked choke", category: null, athlete_id: null, timestamp_start: 375, timestamp_end: null, submission_type_name: null }],
    completed_at: null,
  },
};

const AUDIO_SYNC = { "vid-1": { is_primary: true, sync_offset_ms: 0 }, "vid-2": { sync_offset_ms: 2500, sync_source: "audio", sync_confidence: 0.8 } };

async function renderLoadedPlayer(opts: { videos?: number; analysis?: unknown; extra?: Record<string, unknown>[]; sync?: Record<string, Record<string, unknown>> } = {}) {
  queries().getMatchVideoPlaybackResult.mockResolvedValue(playableInMatch());
  mockUseMatchDetail.mockImplementation((id: string | undefined) =>
    id === MATCH ? detailView(opts.videos ?? 2, opts.extra, opts.sync) : { state: "loading", data: null, error: null, refreshing: false, refetch: jest.fn() },
  );
  mockGetVideoAnalysis.mockResolvedValue(opts.analysis ?? ANALYSIS);
  const utils = render(React.createElement(MatchVideoScreen));
  // The first full Film Room render loads and transforms the controls on a
  // cold jest cache (always the case on CI): ~1 s on a Linux runner, past
  // waitFor's 1 s default, then ~200 ms warm (jits-psyv).
  await waitFor(() => expect(lastPlayer()?.replaceAsync).toHaveBeenCalledTimes(1), { timeout: 5000 });
  ready(400);
  return utils;
}

function statusAt(seconds: number) {
  timeTo(seconds);
}

/** Put the hook's switchState at `patch` (on top of idle) and re-render. */
function setSwitch(utils: ReturnType<typeof render>, patch: Record<string, unknown> | null) {
  mockSwitchState = patch ? { ...IDLE_SWITCH_STATE, ...patch } : null;
  act(() => utils.rerender(React.createElement(MatchVideoScreen)));
}

/** The switch to vid-2 started at the tap, still loading. */
function pendingTo2(extra: Record<string, unknown> = {}) {
  return { phase: "pending", seq: 1, fromId: "vid-1", targetId: "vid-2", startedAt: Date.now(), ...extra };
}

/** The same switch, landed. */
function landedOn2(extra: Record<string, unknown> = {}) {
  return { ...pendingTo2(), phase: "landing", landedAt: Date.now(), ...extra };
}

describe("MatchVideoScreen Film Room controls", () => {
  it("starts at ?t= by seeking on the first load", async () => {
    mockT = "27";
    queries().getMatchVideoPlaybackResult.mockResolvedValue(playableInMatch());
    render(React.createElement(MatchVideoScreen));
    await swapped();
    ready();
    expect(lastPlayer().seeks).toEqual([27]);
    // Seek first, then play from there.
    expect(lastPlayer().play).toHaveBeenCalled();
  });

  it("loads the match from the recording's match id and titles the player", async () => {
    const utils = await renderLoadedPlayer();
    expect(mockUseMatchDetail).toHaveBeenCalledWith(MATCH);
    expect(utils.getByText("K. Reyes vs M. Park")).toBeTruthy();
    expect(utils.queryByText("RANKED")).toBeNull();
    expect(mockGetVideoAnalysis).toHaveBeenCalledWith({}, "vid-1");
  });

  it("marks every key moment on the seek bar and steps through them by time (jits-xfvd.18)", async () => {
    const utils = await renderLoadedPlayer();
    await waitFor(() => expect(utils.getByTestId("moment-stepper")).toBeTruthy());
    // Engage, takedown, guard pass, and the finish from the analysis's own
    // technique tag at 06:15 video time (never the 06:17 match clock).
    expect(utils.getAllByTestId(/^seek-marker-/, { includeHiddenElements: true })).toHaveLength(4);
    expect(utils.getByText("4 KEY MOMENTS")).toBeTruthy();
    // Before the first moment: its time, prev disabled, next jumps to it.
    statusAt(2);
    expect(utils.getByTestId("moment-step-time")).toHaveTextContent("00:09");
    expect(utils.getByTestId("moment-step-count")).toHaveTextContent("1/4");
    expect(utils.getByTestId("moment-step-prev").props.accessibilityState).toMatchObject({ disabled: true });
    expect(utils.getByTestId("moment-step-prev").props.accessibilityLabel).toBe("Previous key moment");
    fireEvent.press(utils.getByLabelText("Next key moment, 00:09"));
    expect(lastPlayer().seeks.at(-1)).toBe(9);
    // The seek lands, then playback moves on.
    statusAt(9);
    // Between moments: prev and next are the neighbours of the one shown.
    statusAt(30);
    expect(utils.getByTestId("moment-step-time")).toHaveTextContent("00:27");
    expect(utils.getByTestId("moment-step-count")).toHaveTextContent("2/4");
    fireEvent.press(utils.getByLabelText("Next key moment, 03:12"));
    expect(lastPlayer().seeks.at(-1)).toBe(192);
    statusAt(192);
    expect(utils.getByTestId("moment-step-count")).toHaveTextContent("3/4");
    fireEvent.press(utils.getByLabelText("Previous key moment, 00:27"));
    expect(lastPlayer().seeks.at(-1)).toBe(27);
    statusAt(27);
    fireEvent.press(utils.getByTestId("moment-step-current"));
    expect(lastPlayer().seeks.at(-1)).toBe(27);
    statusAt(27);
    // Past the last moment: next is disabled.
    statusAt(390);
    expect(utils.getByTestId("moment-step-time")).toHaveTextContent("06:15");
    expect(utils.getByTestId("moment-step-next").props.accessibilityState).toMatchObject({ disabled: true });
    expect(utils.getByTestId("moment-step-next").props.accessibilityLabel).toBe("Next key moment");
  });

  it("steps over a second shared by two moments without sticking (review M1)", async () => {
    const utils = await renderLoadedPlayer({
      videos: 1,
      analysis: {
        ok: true,
        data: { ...ANALYSIS.data, positions: [{ position: "standing", timestamp_s: 6 }], scoring_moments: [{ type: "takedown", timestamp_s: 6 }, { type: "sweep", timestamp_s: 40 }], technique_tags: [] },
      },
    });
    await waitFor(() => expect(utils.getByTestId("moment-stepper")).toBeTruthy());
    statusAt(45);
    expect(utils.getByTestId("moment-step-count")).toHaveTextContent("2/2");
    fireEvent.press(utils.getByLabelText("Previous key moment, 00:06"));
    expect(lastPlayer().seeks.at(-1)).toBe(6);
    statusAt(6);
    expect(utils.getByTestId("moment-step-count")).toHaveTextContent("1/2");
    expect(utils.getByTestId("moment-step-current").props.accessibilityState).toMatchObject({ selected: true });
    expect(utils.getByTestId("moment-step-prev").props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("lights the current moment and shows no AI move wording or caption (jits-xfvd.18)", async () => {
    const utils = await renderLoadedPlayer();
    await waitFor(() => expect(utils.getByTestId("moment-stepper")).toBeTruthy());
    statusAt(30);
    expect(utils.getByTestId("moment-step-current").props.accessibilityState).toMatchObject({ selected: true });
    expect(utils.getByTestId("moment-step-current").props.accessibilityLabel).toBe("Key moment 2 of 4, 00:27");
    expect(utils.queryByTestId("player-caption")).toBeNull();
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:30 / 06:40");
    for (const word of [/takedown/i, /single leg/i, /guard pass/i, /choke/i, /engage/i, /standing/i, /hand fighting/i, /finish/i]) {
      expect(utils.queryAllByText(word, { includeHiddenElements: true })).toHaveLength(0);
      expect(utils.queryAllByLabelText(word, { includeHiddenElements: true })).toHaveLength(0);
    }
    // More than 10 s on, the moment is no longer lit.
    statusAt(45);
    expect(utils.getByTestId("moment-step-current").props.accessibilityState).toMatchObject({ selected: false });
  });

  it("skips 10 s either way, clamped to the clip", async () => {
    const utils = await renderLoadedPlayer();
    statusAt(30);
    fireEvent.press(utils.getByLabelText("Forward 10 seconds"));
    expect(lastPlayer().seeks.at(-1)).toBe(40);
    fireEvent.press(utils.getByLabelText("Back 10 seconds"));
    expect(lastPlayer().seeks.at(-1)).toBe(30);
    statusAt(30);
    statusAt(5);
    fireEvent.press(utils.getByLabelText("Back 10 seconds"));
    expect(lastPlayer().seeks.at(-1)).toBe(0);
    statusAt(0);
    statusAt(398);
    fireEvent.press(utils.getByLabelText("Forward 10 seconds"));
    expect(lastPlayer().seeks.at(-1)).toBe(400);
  });

  it("pauses and cycles playback speed on the player", async () => {
    const utils = await renderLoadedPlayer();
    const p = lastPlayer();
    expect(p.playing).toBe(true);
    expect(p.playbackRate).toBe(1);
    fireEvent.press(utils.getByLabelText("Playback speed, 1x"));
    expect(p.playbackRate).toBe(0.5);
    expect(utils.getByLabelText("Playback speed, 0.5x")).toBeTruthy();

    fireEvent.press(utils.getByLabelText("Pause"));
    expect(p.pause).toHaveBeenCalled();
    expect(p.playing).toBe(false);
    expect(utils.getByLabelText("Play")).toBeTruthy();
    // Setting the rate on iOS starts AVPlayer: a paused change waits for Play.
    fireEvent.press(utils.getByLabelText("Playback speed, 0.5x"));
    expect(p.playbackRate).toBe(0.5);
    expect(p.playing).toBe(false);
    fireEvent.press(utils.getByLabelText("Play"));
    expect(p.playbackRate).toBe(0.25);
    expect(p.playing).toBe(true);
    expect(mockViewProps.current!.nativeControls).toBe(false);
  });

  it("stops at the end and Play restarts from the top", async () => {
    const utils = await renderLoadedPlayer();
    statusAt(399.8);
    act(() => lastPlayer().emit("playToEnd"));
    expect(utils.getByLabelText("Play")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Play"));
    expect(lastPlayer().seeks.at(-1)).toBe(0);
    expect(lastPlayer().playing).toBe(true);
  });

  it("gives the seek bar, moment stepper and angle segments 44 pt targets", async () => {
    const utils = await renderLoadedPlayer();
    await waitFor(() => expect(utils.getByTestId("moment-stepper")).toBeTruthy());
    const flat = (el: { props: { style: unknown } }) => Object.assign({}, ...([] as unknown[]).concat(el.props.style).flat(3).filter(Boolean));
    const h = (el: { props: { style: unknown } }) => flat(el).height;
    expect(h(utils.getByTestId("player-seek"))).toBe(44);
    for (const id of ["moment-step-prev", "moment-step-current", "moment-step-next"]) expect(h(utils.getByTestId(id))).toBe(44);
    expect(flat(utils.getByTestId("moment-step-prev")).width).toBe(44);
    expect(flat(utils.getByTestId("moment-step-next")).width).toBe(44);
    expect(h(utils.getByLabelText("YOUR ANGLE"))).toBe(44);
  });

  it("switches angle in place, carrying the current time", async () => {
    const utils = await renderLoadedPlayer();
    statusAt(42.6);
    expect(utils.getByLabelText("YOUR ANGLE").props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    // No sync offsets: carry the exact position (never floored), flagged approximate.
    expect(mockSetParams).toHaveBeenCalledWith({ id: "vid-2", t: "42.600", approx: "1" });
  });

  it("translates the time by the match's audio-synced offsets, with no approximate note", async () => {
    const utils = await renderLoadedPlayer({ sync: AUDIO_SYNC });
    statusAt(42.6);
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    // Synced angles keep watching: the engine gets the offsets and the
    // translated time; the route waits for the landing (jits-xfvd.19).
    expect(mockSwitchCalls.at(-1)).toEqual(["vid-2", expect.closeTo(40.1, 6), { approximate: false, offsets: { fromMs: 0, toMs: 2500 } }]);
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(utils.queryByTestId("player-approx-note")).toBeNull();
  });

  it("AC1: 30.000 s on the primary lands on 28.500 s of an angle that started 1.5 s later", async () => {
    const utils = await renderLoadedPlayer({ sync: { ...AUDIO_SYNC, "vid-2": { ...AUDIO_SYNC["vid-2"], sync_offset_ms: 1500 } } });
    statusAt(30);
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    expect(mockSwitchCalls.at(-1)).toEqual(["vid-2", expect.closeTo(28.5, 6), { approximate: false, offsets: { fromMs: 0, toMs: 1500 } }]);
  });

  it("a clock offset translates but still says the position is approximate (review M1)", async () => {
    const utils = await renderLoadedPlayer({ sync: { ...AUDIO_SYNC, "vid-2": { sync_offset_ms: 2500, sync_source: "clock", sync_confidence: null } } });
    statusAt(42.6);
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockSwitchCalls.at(-1)).toEqual(["vid-2", expect.closeTo(40.1, 6), { approximate: true, offsets: { fromMs: 0, toMs: 2500 } }]);
    // The note says so when the switch lands (jits-xfvd.16), not at the tap.
    expect(utils.queryByTestId("player-approx-note")).toBeNull();
    setSwitch(utils, landedOn2({ approximate: true }));
    expect(utils.getByTestId("player-approx-note")).toBeTruthy();
  });

  it("shows the approximate-position note after an unsynced switch, then hides it", async () => {
    jest.useFakeTimers();
    try {
      mockApprox = "1";
      queries().getMatchVideoPlaybackResult.mockResolvedValue(playableInMatch());
      const utils = render(React.createElement(MatchVideoScreen));
      await waitFor(() => expect(screensMade()).toBe(1));
      expect(utils.getByText("Angles aren't synced; position is approximate")).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(utils.queryByTestId("player-approx-note")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not flash 00:00 before a ?t= seek lands", async () => {
    mockT = "27";
    queries().getMatchVideoPlaybackResult.mockResolvedValue(playableInMatch());
    const utils = render(React.createElement(MatchVideoScreen));
    await swapped();
    ready(400);
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:27 / 06:40");
    // A time update from before the seek landed is dropped, not shown.
    statusAt(0);
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:27 / 06:40");
    statusAt(27.4);
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:27 / 06:40");
  });

  it("says no match was detected instead of moments, even if a stray tag would place a finish", async () => {
    const utils = await renderLoadedPlayer({
      videos: 1,
      analysis: { ok: true, data: { ...ANALYSIS.data, match_detected: false, no_match_reason: "Empty room.", recommendations: [] } },
    });
    await waitFor(() => expect(utils.getByTestId("player-no-match")).toHaveTextContent("No match detected in this video"));
    statusAt(30);
    expect(utils.queryByTestId("moment-stepper")).toBeNull();
    expect(utils.queryAllByTestId(/^seek-marker-/, { includeHiddenElements: true })).toHaveLength(0);
    expect(utils.queryByText(/KEY MOMENT/)).toBeNull();
    expect(utils.queryByTestId("player-caption")).toBeNull();
    // The film still plays with its seek bar.
    expect(utils.getByTestId("player-seek")).toBeTruthy();
  });

  it.each([true, null])("match_detected %s keeps the key moments and no note", async (matchDetected) => {
    const utils = await renderLoadedPlayer({
      analysis: { ok: true, data: { ...ANALYSIS.data, match_detected: matchDetected, no_match_reason: null, recommendations: [] } },
    });
    await waitFor(() => expect(utils.getByText("4 KEY MOMENTS")).toBeTruthy());
    expect(utils.queryByTestId("player-no-match")).toBeNull();
  });

  it("shows no angle switcher, chips or caption for one angle with no breakdown", async () => {
    const utils = await renderLoadedPlayer({ videos: 1, analysis: { ok: true, data: null } });
    expect(utils.queryByTestId("angle-switcher")).toBeNull();
    expect(utils.queryByTestId("moment-stepper")).toBeNull();
    expect(utils.queryByTestId("player-caption")).toBeNull();
    expect(utils.getByTestId("player-seek")).toBeTruthy();
  });
});

describe("wave 2: the expo-video player offers only playable angles (jits-n2im.15, review minor 4)", () => {
  it("hides an uploading reservation and an abandoned or failed angle from the switcher", async () => {
    const utils = await renderLoadedPlayer({
      videos: 1,
      extra: [
        { id: "vid-up", uploaded_by: "opp-1", uploaded_by_name: "Mina Park", is_mine: false, angle_label: "Mina Park's recording", status: "uploading", playability: "processing", has_analysis: false },
        { id: "vid-ab", uploaded_by: "tk-1", uploaded_by_name: "Jo Cruz", is_mine: false, angle_label: "Jo Cruz's recording", status: "failed", playability: "failed", failure_code: "upload_abandoned", recording_type: "timekeeper", has_analysis: false },
      ],
    });
    // One playable angle left: no switcher at all.
    expect(utils.queryByTestId("angle-switcher")).toBeNull();
  });

  it("keeps the playable angles and drops the rest when there are still two", async () => {
    const utils = await renderLoadedPlayer({
      extra: [{ id: "vid-up", uploaded_by: "tk-1", uploaded_by_name: "Jo Cruz", is_mine: false, angle_label: "Jo Cruz's recording", status: "uploading", playability: "processing", has_analysis: false }],
    });
    utils.getByTestId("angle-switcher");
    expect(utils.getByLabelText("M. PARK'S ANGLE")).toBeTruthy();
    expect(utils.queryByTestId("angle-vid-up")).toBeNull();
  });
});

describe("angle switch in place (multi-angle P0)", () => {
  async function renderTwoAngles(opts: { sync?: Record<string, Record<string, unknown>>; poster?: boolean; videos?: Record<string, unknown>[] } = {}) {
    queries().getMatchVideoPlaybackResult.mockImplementation((_c: unknown, vid: string) =>
      Promise.resolve({
        ok: true,
        data: { ...playableInMatch(`https://signed.example/${vid}.mp4`).data, posterUrl: opts.poster ? `https://signed.example/${vid}.jpg` : null },
      }),
    );
    mockUseMatchDetail.mockImplementation((id: string | undefined) => {
      if (id !== MATCH) return { state: "loading", data: null, error: null, refreshing: false, refetch: jest.fn() };
      const view = detailView(2, [], opts.sync);
      if (opts.videos) view.data.videos = opts.videos as never[];
      return view;
    });
    mockGetVideoAnalysis.mockResolvedValue({ ok: true, data: null });
    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(lastPlayer()?.replaceAsync).toHaveBeenCalledTimes(1), { timeout: 5000 });
    ready(400);
    // Every playable angle is signed at open, before any switch.
    await waitFor(() => expect(queries().getMatchVideoPlaybackResult).toHaveBeenCalledWith({}, "vid-2", { rendition: "720" }));
    await act(async () => undefined);
    return utils;
  }

  it("an unsynced switch mid-play runs in place: the ms position, play state and speed carry, no remount, no new sign", async () => {
    const utils = await renderTwoAngles();
    fireEvent.press(utils.getByLabelText("Playback speed, 1x"));
    statusAt(42.637);
    const signs = queries().getMatchVideoPlaybackResult.mock.calls.length;
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    expect(queries().getMatchVideoPlaybackResult).toHaveBeenCalledTimes(signs);
    await waitFor(() => expect(replacedUrls()).toEqual(["https://signed.example/vid-1.mp4", "https://signed.example/vid-2.mp4"]));
    ready(400);
    // One screen, each slot view mounted once: nothing remounted.
    expect(screensMade()).toBe(1);
    expect(mockViewMounts.count).toBe(utils.getAllByTestId(/^angle-view-slot-/).length);
    expect(lastPlayer().seeks.at(-1)).toBeCloseTo(42.637, 6);
    expect(lastPlayer().playing).toBe(true);
    expect(lastPlayer().playbackRate).toBe(0.5);
    expect(utils.getByLabelText("Playback speed, 0.5x")).toBeTruthy();
    expect(utils.getByLabelText("M. PARK'S ANGLE").props.accessibilityState).toMatchObject({ selected: true });
    // The new item reaches the target: landed.
    timeTo(42.637);
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:42 / 06:40");
    // (The synced, keep-watching version is in "keep-watching switch on the real engine".)
  });

  it("a paused switch lands paused", async () => {
    const utils = await renderTwoAngles();
    statusAt(12);
    fireEvent.press(utils.getByLabelText("Pause"));
    lastPlayer().play.mockClear();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    await waitFor(() => expect(lastPlayer().replaceAsync).toHaveBeenCalledTimes(2));
    ready(400);
    expect(lastPlayer().seeks.at(-1)).toBe(12);
    expect(lastPlayer().play).not.toHaveBeenCalled();
    expect(utils.getByLabelText("Play")).toBeTruthy();
    // Unsynced: the switch is flagged approximate (the note shows at landing).
    // No offsets on either angle: none are passed, so the engine runs in_place.
    expect(mockSwitchCalls.at(-1)).toEqual(["vid-2", 12, { approximate: true }]);
  });

  it("holds the outgoing frame instead of flashing the new angle's poster", async () => {
    const utils = await renderTwoAngles({ poster: true });
    act(() => mockViewProps.current!.onFirstFrameRender());
    expect(utils.queryByTestId("video-poster")).toBeNull();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    await waitFor(() => expect(lastPlayer().replaceAsync).toHaveBeenCalledTimes(2));
    expect(utils.queryByTestId("video-poster")).toBeNull();
  });

  it("sends ONE telemetry event for the screen, with the switch count and tap-to-frame latency", async () => {
    const now = jest.spyOn(Date, "now");
    try {
      const utils = await renderTwoAngles();
      act(() => lastPlayer().emit("playingChange", { isPlaying: true }));
      statusAt(20);
      now.mockReturnValue(1_000_000);
      fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
      await waitFor(() => expect(lastPlayer().replaceAsync).toHaveBeenCalledTimes(2));
      ready(400);
      now.mockReturnValue(1_000_240);
      // The view's first frame alone is not a landing (it may be frame 0);
      // the resume seek reaching 20 s is.
      act(() => mockViewProps.current!.onFirstFrameRender());
      statusAt(20);
      // The chips stay locked until the landing settles (jits-xfvd.19).
      await unlocked(utils);
      fireEvent.press(utils.getByLabelText("YOUR ANGLE"));
      await waitFor(() => expect(lastPlayer().replaceAsync).toHaveBeenCalledTimes(3));
      now.mockRestore();
      utils.unmount();
      expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
      const payload = mockCaptureMessage.mock.calls[0][1];
      expect(payload.extra).toMatchObject({ videoId: "vid-1", angle: "mine", angleCount: 2, switchCount: 2, switchLatencyMs: 240, switchLatencyMaxMs: 240 });
    } finally {
      now.mockRestore();
    }
  });

  it("logs a timekeeper angle as timekeeper, not opponent", async () => {
    mockId = "vid-tk";
    const utils = await renderTwoAngles({
      videos: [
        { id: "vid-tk", uploaded_by: "tk-1", uploaded_by_name: "Jo Cruz", is_mine: false, recording_type: "timekeeper", angle_label: "Jo Cruz's recording", playability: "playable", has_analysis: false },
        { id: "vid-2", uploaded_by: "opp-1", uploaded_by_name: "Mina Park", is_mine: false, angle_label: "Mina Park's recording", playability: "playable", has_analysis: false },
        { id: "vid-1", uploaded_by: "me-1", uploaded_by_name: "Kai Reyes", is_mine: true, angle_label: "Your recording", playability: "playable", has_analysis: false },
      ],
    });
    utils.unmount();
    const payload = mockCaptureMessage.mock.calls[0][1];
    expect(payload.extra).toMatchObject({ videoId: "vid-tk", angle: "timekeeper", angleCount: 3 });
  });
});

describe("route id changes after a switch (review m4)", () => {
  it("the route catching up with setParams reloads nothing, even after A, B, A", async () => {
    const utils = await renderLoadedPlayer();
    statusAt(20);
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    await waitFor(() => expect(lastPlayer().replaceAsync).toHaveBeenCalledTimes(2));
    ready(400);
    statusAt(20);
    await unlocked(utils);
    fireEvent.press(utils.getByLabelText("YOUR ANGLE"));
    await waitFor(() => expect(lastPlayer().replaceAsync).toHaveBeenCalledTimes(3));
    const signs = queries().getMatchVideoPlaybackResult.mock.calls.length;
    // Stale intermediate route render, then the current one.
    mockId = "vid-2";
    utils.rerender(React.createElement(MatchVideoScreen));
    mockId = "vid-1";
    utils.rerender(React.createElement(MatchVideoScreen));
    await act(async () => undefined);
    expect(queries().getMatchVideoPlaybackResult).toHaveBeenCalledTimes(signs);
    expect(lastPlayer().replaceAsync).toHaveBeenCalledTimes(3);
    expect(screensMade()).toBe(1);
    expect(utils.getByLabelText("YOUR ANGLE").props.accessibilityState).toMatchObject({ selected: true });
  });

  it("an outside navigation reusing the screen opens the new recording at its ?t= with its own note", async () => {
    const utils = await renderLoadedPlayer();
    statusAt(50);
    mockId = "vid-9";
    mockT = "15";
    mockApprox = "1";
    utils.rerender(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(queries().getMatchVideoPlaybackResult).toHaveBeenLastCalledWith({}, "vid-9", { rendition: "720" }));
    await waitFor(() => expect(lastPlayer().replaceAsync).toHaveBeenCalledTimes(2));
    ready(400);
    expect(lastPlayer().seeks.at(-1)).toBe(15);
    expect(utils.getByTestId("player-approx-note")).toBeTruthy();
    expect(screensMade()).toBe(1);
  });
});

describe("angle switch phase 1 UI (jits-xfvd.16)", () => {
  const HIDDEN = { includeHiddenElements: true } as const;
  let announce: jest.SpyInstance;
  beforeEach(() => {
    announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  });
  afterEach(() => announce.mockRestore());

  /** Two angles, audio-synced; only vid-1 has a breakdown (4 key moments). */
  async function renderSynced() {
    mockGetVideoAnalysis.mockImplementation((_c: unknown, vid: string) => Promise.resolve(vid === "vid-1" ? ANALYSIS : { ok: true, data: null }));
    queries().getMatchVideoPlaybackResult.mockResolvedValue(playableInMatch());
    mockUseMatchDetail.mockImplementation((id: string | undefined) =>
      id === MATCH ? detailView(2, [], AUDIO_SYNC) : { state: "loading", data: null, error: null, refreshing: false, refetch: jest.fn() },
    );
    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(lastPlayer()?.replaceAsync).toHaveBeenCalledTimes(1), { timeout: 5000 });
    ready(400);
    await waitFor(() => expect(utils.getByText("4 KEY MOMENTS")).toBeTruthy());
    await waitFor(() => expect(mockGetVideoAnalysis).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    return utils;
  }

  it("reads every playable angle's breakdown up front, once each", async () => {
    const utils = await renderSynced();
    const ids = mockGetVideoAnalysis.mock.calls.map((c) => c[1]);
    expect(ids.sort()).toEqual(["vid-1", "vid-2"]);
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, landedOn2());
    await act(async () => undefined);
    expect(mockGetVideoAnalysis).toHaveBeenCalledTimes(2);
  });

  it("passes the sync verdict to switchAngle and marks the tapped segment busy while pending", async () => {
    const utils = await renderSynced();
    statusAt(42.6);
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    expect(mockSwitchCalls.at(-1)).toEqual(["vid-2", expect.closeTo(40.1, 6), { approximate: false, offsets: { fromMs: 0, toMs: 2500 } }]);
    setSwitch(utils, pendingTo2());
    expect(utils.getByLabelText("M. PARK'S ANGLE").props.accessibilityState).toEqual({ selected: true, busy: true });
    // The lock: the other chip is disabled while the switch is in flight.
    expect(utils.getByTestId("angle-vid-1").props.accessibilityState).toEqual({ disabled: true, selected: false });
    // At LAND the engine moves activeId (the real engine here runs keep_watching).
    // The landing is faked, so the engine does not own vid-2: keep the route still.
    mockSetParams.mockImplementation(() => undefined);
    mockPlaybackPatch = { activeId: "vid-2" };
    setSwitch(utils, landedOn2());
    expect(utils.getByLabelText("M. PARK'S ANGLE").props.accessibilityState).toEqual({ selected: true });
    expect(utils.getByTestId("angle-vid-1").props.accessibilityState).toEqual({ disabled: true, selected: false });
    setSwitch(utils, { ...landedOn2(), phase: "idle" });
    expect(utils.getByTestId("angle-vid-1").props.accessibilityState).toEqual({ selected: false });
  });

  it("holds the outgoing angle's chrome while an in_place switch is pending and swaps it in one render at landing", async () => {
    const utils = await renderSynced();
    statusAt(42.6);
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    // In_place: activeId moves at the tap (the snapshot holds the chrome).
    // The state is faked, so the engine does not own vid-2: keep the route still.
    mockSetParams.mockImplementation(() => undefined);
    mockPlaybackPatch = { activeId: "vid-2" };
    setSwitch(utils, pendingTo2({ mode: "in_place" }));
    // The clock, the moments and the stepper stay on vid-1 at the tap.
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:42 / 06:40");
    expect(utils.getByText("4 KEY MOMENTS")).toBeTruthy();
    expect(utils.getByTestId("moment-stepper")).toBeTruthy();
    mockPlaybackPatch = { activeId: "vid-2", positionS: 40.1 };
    setSwitch(utils, landedOn2({ mode: "in_place" }));
    // vid-2's own values: its translated time and no breakdown.
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:40 / 06:40");
    expect(utils.queryByText(/KEY MOMENT/)).toBeNull();
    expect(utils.queryByTestId("moment-stepper")).toBeNull();
  });

  it("draws the held still while pending, over the video, and nothing at idle", async () => {
    const utils = await renderSynced();
    expect(utils.queryByTestId("switch-overlay", HIDDEN)).toBeNull();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2({ heldFrame: { width: 1920, height: 1080 } }));
    expect(utils.getByTestId("switch-overlay-hold", HIDDEN)).toBeTruthy();
    setSwitch(utils, { ...landedOn2(), phase: "idle" });
    expect(utils.queryByTestId("switch-overlay", HIDDEN)).toBeNull();
  });

  it("shows the Syncing pill for a switch still pending after 200 ms, hidden from screen readers", async () => {
    const utils = await renderSynced();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2({ startedAt: Date.now() - 1000 }));
    await waitFor(() => expect(utils.getByTestId("syncing-pill", HIDDEN)).toHaveTextContent("Syncing angle"), { timeout: 4000 });
    expect(utils.queryByTestId("syncing-pill")).toBeNull();
  });

  it("announces a landing once (none at the tap) and starts the approximate note there", async () => {
    const utils = await renderSynced();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2({ approximate: true }));
    expect(announce).not.toHaveBeenCalled();
    expect(utils.queryByTestId("player-approx-note")).toBeNull();
    setSwitch(utils, landedOn2({ approximate: true }));
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("M. Park's angle. Approximate sync.");
    expect(utils.getByTestId("player-approx-note")).toBeTruthy();
    // The same landing re-rendered and settling to idle say nothing more.
    setSwitch(utils, landedOn2({ approximate: true }));
    setSwitch(utils, { ...landedOn2({ approximate: true }), phase: "idle" });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(utils.getByTestId("player-approx-note")).toBeTruthy();
  });

  it("an exact landing announces the angle alone, with no note", async () => {
    const utils = await renderSynced();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, landedOn2());
    expect(announce).toHaveBeenCalledWith("M. Park's angle.");
    expect(utils.queryByTestId("player-approx-note")).toBeNull();
  });

  it("a failed switch puts the route back, shows the failure tag and announces it once", async () => {
    const utils = await renderSynced();
    statusAt(42.6);
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2());
    mockSetParams.mockClear();
    // The tag's 4 s on a driven clock.
    jest.useFakeTimers();
    try {
      const failed = { seq: 1, targetId: "vid-2", at: Date.now() };
      const restoring = { phase: "pending", seq: 1, restoring: true, fromId: "vid-2", targetId: "vid-1", startedAt: Date.now(), failed };
      setSwitch(utils, restoring);
      expect(mockSetParams).toHaveBeenCalledTimes(1);
      expect(mockSetParams).toHaveBeenCalledWith({ id: "vid-1", t: "42.600", approx: "0" });
      expect(utils.getByTestId("player-switch-failed")).toHaveTextContent("Could not load M. Park's angle. Tap it to try again.");
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith("Could not load M. Park's angle. Tap it to try again.");
      // The restore keeps the lock: the angle coming back is busy, the
      // failed one disabled (contract 07 11.1); its landing is silent.
      expect(utils.getByTestId("angle-vid-1").props.accessibilityState).toEqual({ selected: true, busy: true });
      expect(utils.getByLabelText("M. PARK'S ANGLE").props.accessibilityState).toEqual({ disabled: true, selected: false });
      setSwitch(utils, { ...restoring, phase: "landing", landedAt: Date.now() });
      setSwitch(utils, { ...restoring, phase: "idle", restoring: false });
      expect(announce).toHaveBeenCalledTimes(1);
      expect(mockSetParams).toHaveBeenCalledTimes(1);
      // The tag goes FAILURE_TAG_MS (4 s) after the failure.
      act(() => {
        jest.advanceTimersByTime(3999);
      });
      expect(utils.getByTestId("player-switch-failed")).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(utils.queryByTestId("player-switch-failed")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("the next switch clears the failure tag at once", async () => {
    const utils = await renderSynced();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    const failed = { seq: 1, targetId: "vid-2", at: Date.now() };
    setSwitch(utils, { phase: "idle", seq: 1, fromId: "vid-2", targetId: "vid-1", failed });
    expect(utils.getByTestId("player-switch-failed")).toBeTruthy();
    setSwitch(utils, { ...pendingTo2(), seq: 2 });
    expect(utils.queryByTestId("player-switch-failed")).toBeNull();
  });
});

describe("one slot under the switcher: pill, note and failure tag never overlap (P-AS-01/04/05)", () => {
  const HIDDEN = { includeHiddenElements: true } as const;
  let announce: jest.SpyInstance;
  beforeEach(() => {
    announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  });
  afterEach(() => announce.mockRestore());

  async function renderTwo() {
    mockGetVideoAnalysis.mockResolvedValue({ ok: true, data: null });
    queries().getMatchVideoPlaybackResult.mockResolvedValue(playableInMatch());
    mockUseMatchDetail.mockImplementation((id: string | undefined) =>
      id === MATCH ? detailView(2) : { state: "loading", data: null, error: null, refreshing: false, refetch: jest.fn() },
    );
    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(lastPlayer()?.replaceAsync).toHaveBeenCalledTimes(1), { timeout: 5000 });
    ready(400);
    await waitFor(() => expect(utils.getByTestId("angle-switcher")).toBeTruthy());
    await act(async () => undefined);
    return utils;
  }

  it("puts the pill, the note and the tag in one slot at insets.top + 112", async () => {
    mockApprox = "1";
    const utils = await renderTwo();
    const slot = utils.getByTestId("player-switch-slot");
    expect(slot).toHaveStyle({ top: 112 });
    expect(within(slot).getByTestId("player-approx-note")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2({ startedAt: Date.now() - 1000 }));
    await waitFor(() => expect(within(utils.getByTestId("player-switch-slot")).getByTestId("syncing-pill", HIDDEN)).toBeTruthy(), { timeout: 4000 });
  });

  it("holds the approximate note until the pill has faded out, then shows it for 5 s", async () => {
    const utils = await renderTwo();
    // The pill's delay, minimum and fade, and the note's 5 s, on a driven clock.
    jest.useFakeTimers();
    try {
      const tick = (ms: number) => act(() => {
        jest.advanceTimersByTime(ms);
      });
      fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
      setSwitch(utils, pendingTo2({ approximate: true }));
      tick(200);
      expect(utils.getByTestId("syncing-pill", HIDDEN)).toBeTruthy();
      tick(100);
      setSwitch(utils, landedOn2({ approximate: true }));
      expect(announce).toHaveBeenCalledWith("M. Park's angle. Approximate sync.");
      // Landed, but the pill is still up (its 400 ms minimum, then its 240 ms fade): no note yet.
      tick(299);
      expect(utils.getByTestId("syncing-pill", HIDDEN)).toBeTruthy();
      expect(utils.queryByTestId("player-approx-note")).toBeNull();
      tick(1);
      tick(239);
      expect(utils.getByTestId("syncing-pill", HIDDEN)).toBeTruthy();
      expect(utils.queryByTestId("player-approx-note")).toBeNull();
      tick(1);
      tick(0);
      expect(utils.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
      expect(utils.getByTestId("player-approx-note")).toBeTruthy();
      // Its 5 s start when it appears, not at the landing.
      tick(4999);
      expect(utils.getByTestId("player-approx-note")).toBeTruthy();
      tick(1);
      expect(utils.queryByTestId("player-approx-note")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("a failure removes the pill at once and shows the tag from the moment of failure", async () => {
    const utils = await renderTwo();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2({ startedAt: Date.now() - 1000 }));
    await waitFor(() => expect(utils.getByTestId("syncing-pill", HIDDEN)).toBeTruthy(), { timeout: 4000 });
    const failed = { seq: 1, targetId: "vid-2", at: Date.now() };
    setSwitch(utils, { phase: "pending", seq: 1, restoring: true, fromId: "vid-2", targetId: "vid-1", startedAt: Date.now(), failed });
    expect(utils.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
    expect(utils.getByTestId("player-switch-failed")).toHaveTextContent("Could not load M. Park's angle. Tap it to try again.");
    // Announced at the failure, not at the restore landing.
    expect(announce).toHaveBeenCalledTimes(1);
    setSwitch(utils, { phase: "landing", seq: 1, restoring: true, fromId: "vid-2", targetId: "vid-1", startedAt: Date.now(), landedAt: Date.now(), failed });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(utils.getByTestId("player-switch-failed")).toBeTruthy();
  });
});

describe("angle switch review fixes (jits-xfvd.16)", () => {
  const HIDDEN = { includeHiddenElements: true } as const;
  let announce: jest.SpyInstance;
  beforeEach(() => {
    announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  });
  afterEach(() => announce.mockRestore());

  const VID3 = { id: "vid-3", uploaded_by: "tk-1", uploaded_by_name: "Jo Cruz", is_mine: false, recording_type: "timekeeper", angle_label: "Jo Cruz's recording", playability: "playable", has_analysis: false };

  async function renderAngles(extra: Record<string, unknown>[] = []) {
    mockGetVideoAnalysis.mockImplementation((_c: unknown, vid: string) => Promise.resolve(vid === "vid-1" ? ANALYSIS : { ok: true, data: null }));
    queries().getMatchVideoPlaybackResult.mockResolvedValue(playableInMatch());
    mockUseMatchDetail.mockImplementation((id: string | undefined) =>
      id === MATCH ? detailView(2, extra) : { state: "loading", data: null, error: null, refreshing: false, refetch: jest.fn() },
    );
    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(lastPlayer()?.replaceAsync).toHaveBeenCalledTimes(1), { timeout: 5000 });
    ready(400);
    await waitFor(() => expect(utils.getByTestId("angle-switcher")).toBeTruthy());
    await waitFor(() => expect(utils.getByText("4 KEY MOMENTS")).toBeTruthy());
    await act(async () => undefined);
    return utils;
  }

  it("(3) the note after a landing is not a live region; the note of an open with ?approx=1 is", async () => {
    mockApprox = "1";
    const utils = await renderAngles();
    expect(utils.getByTestId("player-approx-note").props.accessibilityLiveRegion).toBe("polite");
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2({ approximate: true }));
    setSwitch(utils, landedOn2({ approximate: true }));
    await waitFor(() => expect(utils.getByTestId("player-approx-note")).toBeTruthy());
    expect(utils.getByTestId("player-approx-note").props.accessibilityLiveRegion).toBe("none");
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("(6) a restore to a superseded switch's angle snapshots that angle: route and frozen chrome say B", async () => {
    const utils = await renderAngles([VID3]);
    statusAt(42.6);
    // A (vid-1) to B (vid-2), approximate (no offsets).
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2({ approximate: true }));
    // While B is pending, chrome is A's (4 moments). A tap on C is ignored
    // by the lock (jits-xfvd.19), so a supersede now only comes from the
    // engine's own (unreachable) in_place branch: driven here as state.
    expect(utils.getByText("4 KEY MOMENTS")).toBeTruthy();
    fireEvent.press(utils.getByTestId("angle-vid-3"));
    expect(mockSwitchCalls).toHaveLength(1);
    setSwitch(utils, { ...pendingTo2(), seq: 2, fromId: "vid-2", targetId: "vid-3" });
    mockSetParams.mockClear();
    const failed = { seq: 2, targetId: "vid-3", at: Date.now() };
    setSwitch(utils, { phase: "pending", seq: 2, restoring: true, fromId: "vid-3", targetId: "vid-2", startedAt: Date.now(), failed });
    expect(mockSetParams).toHaveBeenCalledTimes(1);
    // B's route, with B's own approx; its time is the restore time on B.
    expect(mockSetParams).toHaveBeenCalledWith({ id: "vid-2", t: "42.600", approx: "1" });
    // Frozen chrome is now B's (no breakdown), not A's 4 moments.
    expect(utils.queryByText(/KEY MOMENT/)).toBeNull();
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:42 / 06:40");
    expect(utils.getByTestId("player-switch-failed")).toHaveTextContent("Could not load J. Cruz's angle. Tap it to try again.");
  });

  it("(7) no failure tag and no announcement once playback itself failed (retry panel)", async () => {
    const utils = await renderAngles();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2());
    mockPlaybackPatch = { phase: "failed" };
    setSwitch(utils, { phase: "idle", seq: 1, fromId: "vid-1", targetId: "vid-2", failed: { seq: 1, targetId: "vid-2", at: Date.now() } });
    expect(utils.queryByTestId("player-switch-failed")).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it("(7) a failed switch with no angle to return to removes the pill at once", async () => {
    const utils = await renderAngles();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2({ startedAt: Date.now() - 1000 }));
    await waitFor(() => expect(utils.getByTestId("syncing-pill", HIDDEN)).toBeTruthy(), { timeout: 4000 });
    setSwitch(utils, { phase: "idle", seq: 1, fromId: null, targetId: "vid-2", failed: { seq: 1, targetId: "vid-2", at: Date.now() } });
    expect(utils.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
    expect(utils.getByTestId("player-switch-failed")).toBeTruthy();
  });
});

/**
 * The screen on the REAL keep-watching engine (jits-xfvd.19): two
 * audio-synced angles (vid-2 is 2.5 s behind, so map(tA) = tA - 2.5), fake
 * timers (Date.now moves with them). Angle 1 plays in slot 0 while angle 2
 * loads muted in slot 1, is chased into step and takes over at LAND.
 */
describe("keep-watching switch on the real engine (jits-xfvd.19)", () => {
  const HIDDEN = { includeHiddenElements: true } as const;
  const OFFSET_S = 2.5;
  let announce: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  });
  afterEach(() => {
    announce.mockRestore();
    jest.useRealTimers();
  });

  const flush = async () => {
    for (let i = 0; i < 4; i++) await act(async () => undefined);
  };
  const advance = async (ms: number) => {
    act(() => {
      jest.advanceTimersByTime(ms);
    });
    await flush();
  };

  /** vid-1 signs at once; vid-2's sign answers with `vid2` (default: ready, with a poster when asked). */
  async function renderEngine(opts: { vid2?: () => Promise<unknown>; poster?: boolean } = {}) {
    mockSwitchState = null;
    const signed = (vid: string) => ({
      ok: true,
      data: { ...playableInMatch(`https://signed.example/${vid}.mp4`).data, posterUrl: opts.poster ? `https://signed.example/${vid}.jpg` : null },
    });
    queries().getMatchVideoPlaybackResult.mockImplementation((_c: unknown, vid: string) =>
      vid === "vid-2" && opts.vid2 ? opts.vid2() : Promise.resolve(signed(vid)),
    );
    mockUseMatchDetail.mockImplementation((id: string | undefined) =>
      id === MATCH ? detailView(2, [], AUDIO_SYNC) : { state: "loading", data: null, error: null, refreshing: false, refetch: jest.fn() },
    );
    mockGetVideoAnalysis.mockResolvedValue({ ok: true, data: null });
    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(lastPlayer()?.replaceAsync).toHaveBeenCalledTimes(1), { timeout: 5000 });
    ready(400);
    act(() => mockViewProps.current!.onFirstFrameRender());
    await waitFor(() => expect(utils.getByTestId("angle-switcher")).toBeTruthy());
    await flush();
    return utils;
  }

  let tapAt = 0;
  let tapA = 0;
  let tapRate = 1;
  /** Angle 1's time now (extrapolated from the tap) mapped onto angle 2. */
  const mappedNow = () => tapA - OFFSET_S + ((Date.now() - tapAt) / 1000) * tapRate;

  /** Angle 1 at `at` s, then a tap on angle 2. */
  async function tapAngle2(utils: ReturnType<typeof render>, at = 42.6, rate = 1) {
    timeOn(lastPlayer(), at);
    tapAt = Date.now();
    tapA = at;
    tapRate = rate;
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    await flush();
  }

  /** B is loaded and ready at its target; then its scheduled start, then in-step samples until LAND. */
  async function landPlaying(B: FakePlayer) {
    await waitFor(() => expect(B.seeks.length).toBeGreaterThan(0));
    const t0 = B.seeks.at(-1)!;
    readyOn(B);
    act(() => mockViewPropsById["video-player-incoming"].onFirstFrameRender());
    await flush();
    const waitMs = ((t0 - mappedNow()) / tapRate) * 1000 - 120;
    await advance(Math.max(0, Math.ceil(waitMs)));
    expect(B.play).toHaveBeenCalled();
    for (let i = 0; i < 6 && mockViewPropsById["video-player"].player !== B; i++) {
      await advance(i === 0 ? 220 : 100);
      timeOn(B, mappedNow());
    }
    expect(mockViewPropsById["video-player"].player).toBe(B);
  }

  it("mid-play: angle 1 keeps playing with no new sign while angle 2 loads muted, plays at the session speed, then everything flips at LAND", async () => {
    const utils = await renderEngine();
    fireEvent.press(utils.getByLabelText("Playback speed, 1x"));
    const A = lastPlayer();
    const signs = queries().getMatchVideoPlaybackResult.mock.calls.length;
    await tapAngle2(utils, 42.637, 0.5);
    expect(queries().getMatchVideoPlaybackResult).toHaveBeenCalledTimes(signs);
    const B = incomingPlayer();
    expect(B).not.toBe(A);
    await waitFor(() => expect(replacedUrls(B)).toEqual(["https://signed.example/vid-2.mp4"]));
    // Angle 1 never stopped and kept its item; angle 2 is muted at 0.5x.
    expect(A.pause).not.toHaveBeenCalled();
    expect(replacedUrls(A)).toEqual(["https://signed.example/vid-1.mp4"]);
    expect((B as unknown as { muted: boolean }).muted).toBe(true);
    // (B takes the session speed when it starts; checked after LAND.)
    // The chrome is angle 1's, live; the chips are locked.
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:42 / 06:40");
    expect(utils.getByTestId("angle-vid-2").props.accessibilityState).toEqual({ selected: true, busy: true });
    expect(utils.getByTestId("angle-vid-1").props.accessibilityState).toEqual({ disabled: true, selected: false });
    expect(mockSetParams).not.toHaveBeenCalled();
    await landPlaying(B);
    // LAND: the front, clock, selection and route are angle 2's, in step.
    expect(utils.getByTestId("player-time")).toHaveTextContent(`00:${Math.floor(B.currentTime)} / 06:40`);
    expect(utils.getByTestId("angle-vid-2").props.accessibilityState).toEqual({ selected: true });
    expect(B.playbackRate).toBe(0.5);
    expect(screensMade()).toBe(1);
    expect(mockViewMounts.count).toBe(2);
    expect(announce).toHaveBeenCalledWith("M. Park's angle.");
    // Settle: idle, the lock opens.
    await advance(300);
    expect(utils.getByTestId("angle-vid-1").props.accessibilityState).toEqual({ selected: false });
  });

  it("the route t at LAND is angle 2's landed time (read in the LAND commit), and its poster never pops", async () => {
    const utils = await renderEngine({ poster: true });
    expect(utils.queryByTestId("video-poster")).toBeNull();
    await tapAngle2(utils, 42.6);
    const B = incomingPlayer();
    await waitFor(() => expect(replacedUrls(B)).toEqual(["https://signed.example/vid-2.mp4"]));
    expect(utils.queryByTestId("video-poster")).toBeNull();
    // Watch every render from here: the poster must never show.
    const posterSeen: boolean[] = [];
    const seen = () => posterSeen.push(utils.queryByTestId("video-poster") != null);
    await waitFor(() => expect(B.seeks.length).toBeGreaterThan(0));
    readyOn(B);
    seen();
    act(() => mockViewPropsById["video-player-incoming"].onFirstFrameRender());
    seen();
    const t0 = B.seeks.at(-1)!;
    await advance(Math.max(0, Math.ceil((t0 - mappedNow()) * 1000 - 120)));
    seen();
    for (let i = 0; i < 6 && mockViewPropsById["video-player"].player !== B; i++) {
      await advance(i === 0 ? 220 : 100);
      timeOn(B, mappedNow());
      seen();
    }
    expect(mockViewPropsById["video-player"].player).toBe(B);
    expect(mockSetParams).toHaveBeenCalledTimes(1);
    const routeT = Number(mockSetParams.mock.calls[0][0].t);
    expect(mockSetParams.mock.calls[0][0]).toMatchObject({ id: "vid-2", approx: "0" });
    // B's own time at LAND (the engine's tB), not the tap's translated 40.100.
    expect(routeT).toBeCloseTo(B.currentTime, 3);
    expect(Math.abs(routeT - 40.1)).toBeGreaterThan(0.5);
    await advance(300);
    seen();
    expect(posterSeen.every((up) => !up)).toBe(true);
    expect(utils.queryByTestId("video-poster")).toBeNull();
  });

  it("a slow sign shows the Syncing pill over angle 1, then the switch lands and it goes", async () => {
    let release: (v: unknown) => void = () => undefined;
    const slow = new Promise((resolve) => {
      release = resolve;
    });
    const utils = await renderEngine({ vid2: () => slow });
    await tapAngle2(utils);
    // The pre-sign is still in flight: it is the one the switch waits on.
    expect(utils.getByTestId("angle-vid-2").props.accessibilityState).toEqual({ selected: true, busy: true });
    await advance(250);
    expect(utils.getByTestId("syncing-pill", HIDDEN)).toHaveTextContent("Syncing angle");
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:42 / 06:40");
    await act(async () => {
      release(playableInMatch("https://signed.example/vid-2.mp4"));
    });
    await flush();
    const B = incomingPlayer();
    await landPlaying(B);
    expect(utils.getByTestId("angle-vid-2").props.accessibilityState).toEqual({ selected: true });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("M. Park's angle.");
    // Its minimum time up, then its fade-out.
    await advance(500);
    await advance(500);
    expect(utils.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
    utils.unmount();
    expect(mockCaptureMessage.mock.calls.at(-1)?.[1].extra).toMatchObject({ switchPillShownCount: 1, switchCount: 1, switchKeepWatchingCount: 1 });
  });

  it("a sign failure abandons: angle 1 never stopped, no restore and no route move, the tag shows and speaks once, the chips unlock", async () => {
    const utils = await renderEngine({ vid2: () => Promise.resolve({ ok: false, error: { code: "UNKNOWN", message: "connection failure" } }) });
    const A = lastPlayer();
    await tapAngle2(utils);
    await waitFor(() => expect(utils.getByTestId("player-switch-failed")).toHaveTextContent("Could not load M. Park's angle. Tap it to try again."));
    expect(A.pause).not.toHaveBeenCalled();
    expect(replacedUrls(A)).toEqual(["https://signed.example/vid-1.mp4"]);
    expect(mockViewPropsById["video-player"].player).toBe(A);
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(utils.getByTestId("angle-vid-1").props.accessibilityState).toEqual({ selected: true });
    expect(utils.getByTestId("angle-vid-2").props.accessibilityState).toEqual({ selected: false });
    expect(utils.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
    await advance(500);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Could not load M. Park's angle. Tap it to try again.");
  });

  it("paused: angle 2 seeks to the exact moment and lands on its first frame after the seek; the route names its time", async () => {
    const utils = await renderEngine();
    timeOn(lastPlayer(), 42.6);
    fireEvent.press(utils.getByLabelText("Pause"));
    await tapAngle2(utils);
    const B = incomingPlayer();
    await waitFor(() => expect(B.seeks.length).toBeGreaterThan(0));
    expect(B.seeks.at(-1)).toBeCloseTo(40.1, 6);
    readyOn(B);
    expect(B.playing).toBe(false);
    // Pending until a frame of the new item is drawn: the clock stays on angle 1.
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:42 / 06:40");
    act(() => mockViewPropsById["video-player-incoming"].onFirstFrameRender());
    await flush();
    expect(mockViewPropsById["video-player"].player).toBe(B);
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:40 / 06:40");
    expect(utils.getByLabelText("Play")).toBeTruthy();
    expect(mockSetParams).toHaveBeenCalledWith({ id: "vid-2", t: "40.100", approx: "0" });
    expect(announce).toHaveBeenCalledWith("M. Park's angle.");
  });
});

describe("keep-watching angle switch UI (jits-xfvd.19)", () => {
  const HIDDEN = { includeHiddenElements: true } as const;
  let announce: jest.SpyInstance;
  let select: jest.SpyInstance;
  beforeEach(() => {
    announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
    select = jest.spyOn(require("@/lib/motion").haptics, "select").mockResolvedValue(undefined);
  });
  afterEach(() => {
    announce.mockRestore();
    select.mockRestore();
  });

  /** The engine's two slot players, handed to the screen through the hook's result. */
  function slotPlayers(): [FakePlayer, FakePlayer] {
    const make = (require("expo-video") as { __createPlayer: () => FakePlayer }).__createPlayer;
    const a = make();
    const b = make();
    a.source = { uri: "https://signed.example/vid-1.mp4" };
    return [a, b];
  }

  /**
   * Two audio-synced angles (vid-1 has 4 key moments), shown by slot 0. The
   * hook's switch state is pinned idle and activeId to vid-1, so the screen
   * sees only what each test drives (the real base engine runs in_place).
   */
  async function renderKeepWatching() {
    mockGetVideoAnalysis.mockImplementation((_c: unknown, vid: string) => Promise.resolve(vid === "vid-1" ? ANALYSIS : { ok: true, data: null }));
    queries().getMatchVideoPlaybackResult.mockResolvedValue(playableInMatch());
    mockUseMatchDetail.mockImplementation((id: string | undefined) =>
      id === MATCH ? detailView(2, [], AUDIO_SYNC) : { state: "loading", data: null, error: null, refreshing: false, refetch: jest.fn() },
    );
    const players = slotPlayers();
    const onSlotFirstFrame = jest.fn();
    mockSwitchState = { ...IDLE_SWITCH_STATE };
    mockPlaybackPatch = { players, frontSlot: 0, onSlotFirstFrame, activeId: "vid-1", positionS: 42.6, currentTimeNow: () => 42.6 };
    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(lastPlayer()?.replaceAsync).toHaveBeenCalledTimes(1), { timeout: 5000 });
    ready(400);
    await waitFor(() => expect(utils.getByText("4 KEY MOMENTS")).toBeTruthy());
    await waitFor(() => expect(mockGetVideoAnalysis).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    return { utils, players, onSlotFirstFrame };
  }

  function patch(utils: ReturnType<typeof render>, p: Record<string, unknown>) {
    mockPlaybackPatch = { ...mockPlaybackPatch, ...p };
    act(() => utils.rerender(React.createElement(MatchVideoScreen)));
  }

  /** zIndex of a slot's view (1 = on top). */
  function zOf(utils: ReturnType<typeof render>, slot: 0 | 1) {
    const style = [utils.getByTestId(`angle-view-slot-${slot}`).props.style].flat(Infinity) as Record<string, unknown>[];
    return style.reduce<unknown>((z, s) => (s && typeof s === "object" && "zIndex" in s ? s.zIndex : z), undefined);
  }

  const KW = { mode: "keep_watching", fromSlot: 0, incomingSlot: 1, leadMs: 1000 } as const;

  it("stacks one view per slot player, front on top, each wired to its own first frame", async () => {
    const { utils, players, onSlotFirstFrame } = await renderKeepWatching();
    expect(mockViewPropsById["video-player"].player).toBe(players[0]);
    expect(mockViewPropsById["video-player-incoming"].player).toBe(players[1]);
    expect(mockViewPropsById["video-player"].nativeControls).toBe(false);
    expect(mockViewPropsById["video-player"].contentFit).toBe("contain");
    expect(zOf(utils, 0)).toBe(1);
    expect(zOf(utils, 1)).toBe(0);
    act(() => mockViewPropsById["video-player-incoming"].onFirstFrameRender());
    expect(onSlotFirstFrame).toHaveBeenCalledWith(1);
    act(() => mockViewPropsById["video-player"].onFirstFrameRender());
    expect(onSlotFirstFrame).toHaveBeenLastCalledWith(0);
  });

  it("passes both angles' offsets, keeps the chrome LIVE on angle 1 while pending and flips it at the crossfade", async () => {
    const { utils } = await renderKeepWatching();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    expect(mockSwitchCalls.at(-1)).toEqual(["vid-2", expect.closeTo(40.1, 6), { approximate: false, offsets: { fromMs: 0, toMs: 2500 } }]);
    setSwitch(utils, pendingTo2(KW));
    // Angle 1 keeps playing: its clock moves (no snapshot) and its moments stay.
    patch(utils, { positionS: 44.2 });
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:44 / 06:40");
    expect(utils.getByText("4 KEY MOMENTS")).toBeTruthy();
    // No held still in keep-watching, even if one were set.
    setSwitch(utils, pendingTo2({ ...KW, heldFrame: { width: 1920, height: 1080 } }));
    expect(utils.queryByTestId("switch-overlay", HIDDEN)).toBeNull();
    // The landing: activeId, the front slot and the time are angle 2's, in one render.
    mockPlaybackPatch = { ...mockPlaybackPatch, activeId: "vid-2", frontSlot: 1, positionS: 45.25 };
    setSwitch(utils, landedOn2(KW));
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:45 / 06:40");
    expect(utils.queryByText(/KEY MOMENT/)).toBeNull();
  });

  it("moves the route at the crossfade, with the landed time, not at the tap", async () => {
    const { utils } = await renderKeepWatching();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2(KW));
    expect(mockSetParams).not.toHaveBeenCalled();
    mockPlaybackPatch = { ...mockPlaybackPatch, activeId: "vid-2", frontSlot: 1, currentTimeNow: () => 45.25 };
    setSwitch(utils, landedOn2(KW));
    expect(mockSetParams).toHaveBeenCalledTimes(1);
    expect(mockSetParams).toHaveBeenCalledWith({ id: "vid-2", t: "45.250", approx: "0" });
    setSwitch(utils, { ...landedOn2(KW), phase: "idle" });
    expect(mockSetParams).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an abandon that goes pending to idle in one batch", { ...pendingTo2(KW), phase: "idle" }],
    ["a failure abandon in one batch", { ...pendingTo2(KW), phase: "idle", failed: { seq: 1, targetId: "vid-2", at: Date.now() } }],
  ])("the route never moves after %s, even if activeId reaches the target later", async (_label, ended) => {
    const { utils } = await renderKeepWatching();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    // No pending render: the engine's state goes straight to idle.
    setSwitch(utils, ended as Record<string, unknown>);
    mockPlaybackPatch = { ...mockPlaybackPatch, activeId: "vid-2" };
    setSwitch(utils, { ...pendingTo2(KW), phase: "idle" });
    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it("the route move belongs to the tap's switch only: a later seq or another entry drops it", async () => {
    const { utils } = await renderKeepWatching();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    // A later switch (seq 2) lands on the same angle: not the tap's switch.
    mockPlaybackPatch = { ...mockPlaybackPatch, activeId: "vid-2", frontSlot: 1 };
    setSwitch(utils, landedOn2({ ...KW, seq: 2 }));
    expect(mockSetParams).not.toHaveBeenCalled();
    // Another recording opened (new entry) mid-switch.
    mockPlaybackPatch = { ...mockPlaybackPatch, activeId: "vid-1", frontSlot: 0 };
    setSwitch(utils, { ...IDLE_SWITCH_STATE, seq: 2 });
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2({ ...KW, seq: 3 }));
    mockPlaybackPatch = { ...mockPlaybackPatch, entryId: "vid-9", activeId: "vid-2", frontSlot: 1 };
    setSwitch(utils, landedOn2({ ...KW, seq: 3 }));
    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it("the outgoing view stays on top through the landing, then the new front is on top", async () => {
    const { utils, players } = await renderKeepWatching();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2(KW));
    expect(zOf(utils, 0)).toBe(1);
    mockPlaybackPatch = { ...mockPlaybackPatch, activeId: "vid-2", frontSlot: 1 };
    setSwitch(utils, landedOn2(KW));
    // The front view (and its id) is angle 2's; angle 1 (slot 0) fades out over it.
    expect(mockViewPropsById["video-player"].player).toBe(players[1]);
    expect(zOf(utils, 0)).toBe(1);
    expect(utils.queryByTestId("angle-view-dip")).toBeNull();
    setSwitch(utils, { ...landedOn2(KW), phase: "idle" });
    expect(zOf(utils, 1)).toBe(1);
    expect(zOf(utils, 0)).toBe(0);
  });

  it("an approximate keep-watching landing dips and announces once", async () => {
    const { utils } = await renderKeepWatching();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2({ ...KW, approximate: true }));
    mockPlaybackPatch = { ...mockPlaybackPatch, activeId: "vid-2", frontSlot: 1 };
    setSwitch(utils, landedOn2({ ...KW, approximate: true }));
    expect(utils.getByTestId("angle-view-dip")).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("M. Park's angle. Approximate sync.");
  });

  it("LOCK: every chip is locked from the tap until idle; ignored taps only count, never buzz or switch", async () => {
    const { utils } = await renderKeepWatching();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    expect(select).toHaveBeenCalledTimes(1);
    setSwitch(utils, pendingTo2(KW));
    // The tapped chip reads busy + selected; angle 1's (still on screen) is disabled and dimmed.
    expect(utils.getByTestId("angle-vid-2").props.accessibilityState).toEqual({ selected: true, busy: true });
    expect(utils.getByTestId("angle-vid-1").props.accessibilityState).toEqual({ disabled: true, selected: false });
    expect(utils.getByTestId("angle-vid-1")).toHaveStyle({ opacity: 0.5 });
    fireEvent.press(utils.getByTestId("angle-vid-1"));
    fireEvent.press(utils.getByTestId("angle-vid-2"));
    expect(mockSwitchCalls).toHaveLength(1);
    expect(mockTapIgnored).toHaveBeenCalledTimes(1);
    // Landing: the landed chip is selected, the rest stay locked (D4); no haptic.
    mockPlaybackPatch = { ...mockPlaybackPatch, activeId: "vid-2", frontSlot: 1 };
    setSwitch(utils, landedOn2(KW));
    expect(utils.getByTestId("angle-vid-2").props.accessibilityState).toEqual({ selected: true });
    expect(utils.getByTestId("angle-vid-1").props.accessibilityState).toEqual({ disabled: true, selected: false });
    fireEvent.press(utils.getByTestId("angle-vid-1"));
    expect(mockTapIgnored).toHaveBeenCalledTimes(2);
    expect(mockSwitchCalls).toHaveLength(1);
    // Idle: unlocked, a new tap switches with one haptic.
    setSwitch(utils, { ...landedOn2(KW), phase: "idle" });
    expect(utils.getByTestId("angle-vid-1").props.accessibilityState).toEqual({ selected: false });
    expect(select).toHaveBeenCalledTimes(1);
    fireEvent.press(utils.getByTestId("angle-vid-1"));
    expect(mockSwitchCalls).toHaveLength(2);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("an abandon for a failure: angle 1 stays, the tag shows and speaks once, chips unlock, no haptic, no route change", async () => {
    const { utils } = await renderKeepWatching();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2({ ...KW, startedAt: Date.now() - 1000 }));
    await waitFor(() => expect(utils.getByTestId("syncing-pill", HIDDEN)).toHaveTextContent("Syncing angle"), { timeout: 4000 });
    const failed = { seq: 1, targetId: "vid-2", at: Date.now() };
    setSwitch(utils, { ...pendingTo2(KW), phase: "idle", failed });
    expect(utils.getByTestId("player-switch-failed")).toHaveTextContent("Could not load M. Park's angle. Tap it to try again.");
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Could not load M. Park's angle. Tap it to try again.");
    expect(utils.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
    expect(utils.getByTestId("angle-vid-1").props.accessibilityState).toEqual({ selected: true });
    expect(utils.getByTestId("angle-vid-2").props.accessibilityState).toEqual({ selected: false });
    expect(utils.getByText("4 KEY MOMENTS")).toBeTruthy();
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledTimes(1);
    // Tap it to try again: a fresh switch.
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    expect(mockSwitchCalls).toHaveLength(2);
  });

  it.each([["background"], ["navigation"]])("an abandon for %s is silent: no tag, no announcement", async () => {
    const { utils } = await renderKeepWatching();
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    setSwitch(utils, pendingTo2(KW));
    setSwitch(utils, { ...pendingTo2(KW), phase: "idle" });
    expect(utils.queryByTestId("player-switch-failed")).toBeNull();
    expect(announce).not.toHaveBeenCalled();
    expect(utils.getByTestId("angle-vid-1").props.accessibilityState).toEqual({ selected: true });
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("an in_place switch keeps the phase-1 snapshot chrome and moves the route at the tap", async () => {
    const { utils } = await renderKeepWatching();
    // In_place moves activeId at the tap (phase 1).
    mockSwitchState = { ...IDLE_SWITCH_STATE };
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    mockPlaybackPatch = { ...mockPlaybackPatch, activeId: "vid-2" };
    setSwitch(utils, pendingTo2({ mode: "in_place" }));
    patch(utils, { positionS: 44.2 });
    // Frozen at the tap: angle 1's 4 moments and its 00:42.
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:42 / 06:40");
    expect(utils.getByText("4 KEY MOMENTS")).toBeTruthy();
    expect(mockSetParams).toHaveBeenCalledWith({ id: "vid-2", t: "40.100", approx: "0" });
  });
});
