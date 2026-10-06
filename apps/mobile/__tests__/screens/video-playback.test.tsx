import * as React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

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
}
const mockPlayers: FakePlayer[] = [];
const mockViewProps: { current: Record<string, any> | null } = { current: null };
const mockViewMounts = { count: 0 };

jest.mock("expo-video", () => {
  const R = require("react");
  const RN = require("react-native");
  function createPlayer(): FakePlayer {
    const listeners: Listener[] = [];
    let time = 0;
    const p = {
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
      replaceAsync: jest.fn((src: { uri: string }) => {
        p.source = src;
        p.status = "loading";
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
      ref.current = createPlayer();
      mockPlayers.push(ref.current);
      setup?.(ref.current);
    }
    return ref.current;
  }
  function VideoView(props: Record<string, any>) {
    mockViewProps.current = props;
    R.useEffect(() => {
      mockViewMounts.count += 1;
    }, []);
    return R.createElement(RN.Text, { testID: props.testID }, props.player.source?.uri ?? "");
  }
  return { useVideoPlayer, VideoView };
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

function lastPlayer() {
  return mockPlayers[mockPlayers.length - 1];
}

function replacedUrls(p = lastPlayer()) {
  return p.replaceAsync.mock.calls.map((c) => (c[0] as { uri: string }).uri);
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

/** The first sign's swap has reached the player. */
async function swapped(count = 1) {
  await waitFor(() => expect(lastPlayer()?.replaceAsync).toHaveBeenCalledTimes(count));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayers.length = 0;
  mockViewProps.current = null;
  mockViewMounts.count = 0;
  mockId = "vid-1";
  mockT = undefined;
  mockApprox = undefined;
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
    await waitFor(() => expect(mockPlayers.length).toBe(1));
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
    expect(mockPlayers).toHaveLength(1);
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
    await waitFor(() => expect(mockPlayers.length).toBe(1));
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

  it("marks every key moment on the seek bar and jumps from a chip", async () => {
    const utils = await renderLoadedPlayer();
    await waitFor(() => expect(utils.getByTestId("moment-chip-0")).toBeTruthy());
    // Engage, takedown, guard pass, and the finish from the analysis's own
    // technique tag at 06:15 video time (never the 06:17 match clock).
    expect(utils.getAllByTestId(/^seek-marker-/, { includeHiddenElements: true })).toHaveLength(4);
    expect(utils.getByText("4 KEY MOMENTS")).toBeTruthy();
    expect(utils.getByText("06:15 REAR-NAKED CHOKE · FINISH")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Jump to 00:27, Takedown"));
    expect(lastPlayer().seeks.at(-1)).toBe(27);
  });

  it("captions the current moment and lights its chip", async () => {
    const utils = await renderLoadedPlayer();
    await waitFor(() => expect(utils.getByTestId("moment-chip-1")).toBeTruthy());
    statusAt(30);
    expect(utils.getByTestId("player-caption")).toHaveTextContent("00:27Takedown: Single leg to the mat");
    expect(utils.getByTestId("moment-chip-1").props.accessibilityState).toMatchObject({ selected: true });
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:30 / 06:40");
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

  it("gives the seek bar, moment chips and angle segments 44 pt targets", async () => {
    const utils = await renderLoadedPlayer();
    await waitFor(() => expect(utils.getByTestId("moment-chip-0")).toBeTruthy());
    const h = (el: { props: { style: unknown } }) => Object.assign({}, ...([] as unknown[]).concat(el.props.style).flat(3)).height;
    expect(h(utils.getByTestId("player-seek"))).toBe(44);
    expect(h(utils.getByTestId("moment-chip-0"))).toBe(44);
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
    expect(mockSetParams).toHaveBeenCalledWith({ id: "vid-2", t: "40.100", approx: "0" });
    expect(utils.queryByTestId("player-approx-note")).toBeNull();
  });

  it("AC1: 30.000 s on the primary lands on 28.500 s of an angle that started 1.5 s later", async () => {
    const utils = await renderLoadedPlayer({ sync: { ...AUDIO_SYNC, "vid-2": { ...AUDIO_SYNC["vid-2"], sync_offset_ms: 1500 } } });
    statusAt(30);
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    expect(mockSetParams).toHaveBeenCalledWith({ id: "vid-2", t: "28.500", approx: "0" });
  });

  it("a clock offset translates but still says the position is approximate (review M1)", async () => {
    const utils = await renderLoadedPlayer({ sync: { ...AUDIO_SYNC, "vid-2": { sync_offset_ms: 2500, sync_source: "clock", sync_confidence: null } } });
    statusAt(42.6);
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    expect(mockSetParams).toHaveBeenCalledWith({ id: "vid-2", t: "40.100", approx: "1" });
    expect(utils.getByTestId("player-approx-note")).toBeTruthy();
  });

  it("shows the approximate-position note after an unsynced switch, then hides it", async () => {
    jest.useFakeTimers();
    try {
      mockApprox = "1";
      queries().getMatchVideoPlaybackResult.mockResolvedValue(playableInMatch());
      const utils = render(React.createElement(MatchVideoScreen));
      await waitFor(() => expect(mockPlayers.length).toBe(1));
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
    expect(utils.queryByTestId("moment-chip-0")).toBeNull();
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
    expect(utils.queryByTestId("moment-chip-0")).toBeNull();
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

  it("a switch mid-play keeps the ms position, play state and speed, with no remount and no new sign", async () => {
    const utils = await renderTwoAngles({ sync: AUDIO_SYNC });
    fireEvent.press(utils.getByLabelText("Playback speed, 1x"));
    statusAt(42.637);
    const signs = queries().getMatchVideoPlaybackResult.mock.calls.length;
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    expect(queries().getMatchVideoPlaybackResult).toHaveBeenCalledTimes(signs);
    await waitFor(() => expect(replacedUrls()).toEqual(["https://signed.example/vid-1.mp4", "https://signed.example/vid-2.mp4"]));
    ready(400);
    // One player, one view, one screen: nothing remounted.
    expect(mockPlayers).toHaveLength(1);
    expect(mockViewMounts.count).toBe(1);
    expect(lastPlayer().seeks.at(-1)).toBeCloseTo(40.137, 6);
    expect(lastPlayer().playing).toBe(true);
    expect(lastPlayer().playbackRate).toBe(0.5);
    expect(utils.getByLabelText("Playback speed, 0.5x")).toBeTruthy();
    expect(utils.getByLabelText("M. PARK'S ANGLE").props.accessibilityState).toMatchObject({ selected: true });
    expect(utils.getByTestId("player-time")).toHaveTextContent("00:40 / 06:40");
    expect(utils.queryByTestId("player-approx-note")).toBeNull();
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
    // Unsynced: the note says so.
    expect(utils.getByTestId("player-approx-note")).toBeTruthy();
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
    expect(mockPlayers).toHaveLength(1);
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
    expect(mockPlayers).toHaveLength(1);
  });
});
