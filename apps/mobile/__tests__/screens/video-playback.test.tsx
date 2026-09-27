import * as React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

// ---- mocks ----

const mockBack = jest.fn();
const mockReplace = jest.fn();

const mockSetParams = jest.fn();
let mockId: string | undefined = "vid-1";
let mockT: string | undefined;

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: mockId, t: mockT }),
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
 * The fake player records the props of every mount so a test can fire the
 * player's own callbacks (onError, onPlaybackStatusUpdate) and see the seek
 * that follows a silent re-sign.
 */
const mockSetPosition = jest.fn(async () => undefined);
const mockPlayers: Array<Record<string, any>> = [];
const mockLatestProps: { current: Record<string, any> | null } = { current: null };
const mockSetAudioMode = jest.fn(async (_mode: Record<string, unknown>) => undefined);

jest.mock("expo-av", () => {
  const R = require("react");
  const RN = require("react-native");
  const Video = R.forwardRef((props: Record<string, any>, ref: unknown) => {
    R.useImperativeHandle(ref, () => ({ setPositionAsync: mockSetPosition }));
    // Record prop changes too (shouldPlay, rate) on the same mount.
    mockLatestProps.current = props;
    R.useEffect(() => {
      mockPlayers.push(props);
    }, []);
    return R.createElement(RN.Text, { testID: "video-player" }, props.source.uri);
  });
  return {
    ResizeMode: { CONTAIN: "contain" },
    Video,
    Audio: { setAudioModeAsync: (mode: Record<string, unknown>) => mockSetAudioMode(mode) },
  };
});

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

jest.mock("@/lib/theme/use-theme", () => ({
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

function stateLabel(utils: ReturnType<typeof render>) {
  // Exactly one element carries the id, and it must be a real accessibility
  // element: idb (the harness) never sees a testID on a non-accessible View.
  const markers = utils.getAllByTestId("video-player-state");
  expect(markers).toHaveLength(1);
  expect(markers[0].props.accessible).toBe(true);
  return markers[0].props.accessibilityLabel;
}

/** First status (load), then a status at `ms` (real playback progress). */
function loadAndPlayTo(ms: number) {
  act(() => {
    lastPlayer().onPlaybackStatusUpdate({ isLoaded: true, positionMillis: 0 });
  });
  act(() => {
    lastPlayer().onPlaybackStatusUpdate({ isLoaded: true, positionMillis: ms });
  });
}

async function playerErrors(count: number) {
  await act(async () => {
    lastPlayer().onError("player error");
  });
  await waitFor(() => expect(mockPlayers.length).toBe(count + 1));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayers.length = 0;
  mockLatestProps.current = null;
  mockId = "vid-1";
  mockT = undefined;
  mockUseMatchDetail.mockReturnValue({ state: "loading", data: null, error: null, refreshing: false, refetch: jest.fn() });
  mockGetVideoAnalysis.mockResolvedValue({ ok: true, data: null });
});

/**
 * Every failure below is a RESOLVED `{ ok: false }`, never a rejection:
 * supabase-js does not reject, so a mockRejectedValue here would exercise a
 * path production cannot produce (jits-icei.5).
 */
describe("MatchVideoScreen", () => {
  it("plays through the iOS silent switch while open, and hands it back on exit", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue(
      playable("https://signed.example/v.mp4"),
    );

    const utils = render(React.createElement(MatchVideoScreen));
    expect(mockSetAudioMode).toHaveBeenCalledWith({ playsInSilentModeIOS: true });
    await waitFor(() => expect(utils.getByTestId("video-player")).toBeTruthy());

    utils.unmount();
    expect(mockSetAudioMode).toHaveBeenLastCalledWith({ playsInSilentModeIOS: false });
  });

  it("plays the signed URL and reports loaded once the player has it", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue(
      playable("https://signed.example/v.mp4"),
    );

    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(utils.getByTestId("video-player")).toBeTruthy());
    expect(stateLabel(utils)).toBe("Video state: loading");

    act(() => {
      lastPlayer().onPlaybackStatusUpdate({ isLoaded: true, positionMillis: 0 });
    });
    expect(stateLabel(utils)).toBe("Video state: loaded");
  });

  it("reads through the playback Result query, not the older wrappers", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue(
      playable("https://signed.example/v.mp4"),
    );

    render(React.createElement(MatchVideoScreen));
    await waitFor(() => {
      expect(queries().getMatchVideoPlaybackResult).toHaveBeenCalledWith({}, "vid-1");
    });
    expect(queries().getMatchVideoSignedUrl).not.toHaveBeenCalled();
    expect(queries().getMatchVideoSignedUrlResult).not.toHaveBeenCalled();
  });

  it("passes the signed poster to the player", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue(
      playable("https://signed.example/v.mp4", "https://signed.example/p.jpg"),
    );

    render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(mockPlayers.length).toBe(1));
    expect(lastPlayer().posterSource).toEqual({ uri: "https://signed.example/p.jpg" });
    expect(lastPlayer().usePoster).toBe(true);
  });

  it("shows the unavailable state when no row is visible", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue({ ok: true, data: null });

    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(utils.getByTestId("video-unavailable")).toBeTruthy());
    expect(stateLabel(utils)).toBe("Video state: absent");
    fireEvent.press(utils.getByLabelText("Back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("does not mount the player while the recording is still uploading", async () => {
    queries().getMatchVideoPlaybackResult.mockResolvedValue({
      ok: true,
      data: { url: "https://x/v.mp4", posterUrl: null, status: "uploading", playability: "processing" },
    });

    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(utils.getByTestId("video-processing")).toBeTruthy());
    expect(utils.queryByTestId("video-player")).toBeNull();
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
    await waitFor(() => expect(mockPlayers.length).toBe(1));
    loadAndPlayTo(42_000);

    // The 1h URL expires mid-match.
    await act(async () => {
      lastPlayer().onError("expired");
    });
    await waitFor(() => expect(utils.getByText("https://signed.example/new.mp4")).toBeTruthy());
    expect(utils.queryByTestId("video-load-failed")).toBeNull();
    expect(mock).toHaveBeenCalledTimes(2);

    act(() => {
      lastPlayer().onPlaybackStatusUpdate({ isLoaded: true, positionMillis: 0 });
    });
    expect(mockSetPosition).toHaveBeenCalledWith(42_000);
    expect(stateLabel(utils)).toBe("Video state: loaded");
  });

  it("shows the retry panel on a second consecutive player error", async () => {
    const mock = queries().getMatchVideoPlaybackResult;
    mock.mockResolvedValue(playable("https://signed.example/v.mp4"));

    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(mockPlayers.length).toBe(1));

    await playerErrors(1);
    expect(stateLabel(utils)).toBe("Video state: loading");

    // The re-signed URL loads and seeks back, then fails at the same spot:
    // a load alone is not progress, so this must not re-sign again.
    act(() => {
      lastPlayer().onPlaybackStatusUpdate({ isLoaded: true, positionMillis: 0 });
    });
    await act(async () => {
      lastPlayer().onError("bad again");
    });
    expect(utils.getByTestId("video-load-failed")).toBeTruthy();
    expect(stateLabel(utils)).toBe("Video state: error");
    // One initial sign plus exactly one silent re-sign.
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("caps silent re-signs at two per screen, even with progress between", async () => {
    const mock = queries().getMatchVideoPlaybackResult;
    mock.mockResolvedValue(playable("https://signed.example/v.mp4"));

    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(mockPlayers.length).toBe(1));
    loadAndPlayTo(10_000);

    await playerErrors(1); // re-sign 1
    loadAndPlayTo(20_000); // real progress clears the streak
    await playerErrors(2); // re-sign 2
    loadAndPlayTo(30_000);
    await act(async () => {
      lastPlayer().onError("third");
    });

    expect(utils.getByTestId("video-load-failed")).toBeTruthy();
    expect(mock).toHaveBeenCalledTimes(3);

    // The user's Retry resets the cap.
    await act(async () => {
      fireEvent.press(utils.getByLabelText("Retry loading video"));
    });
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(utils.getByTestId("video-player")).toBeTruthy());
    loadAndPlayTo(5_000);
    await playerErrors(mockPlayers.length);
    expect(mock).toHaveBeenCalledTimes(5);
  });

  it("ignores player errors while a silent re-sign is in flight", async () => {
    const mock = queries().getMatchVideoPlaybackResult;
    mock.mockResolvedValueOnce(playable("https://signed.example/old.mp4"));
    let resolveSign!: (v: unknown) => void;
    mock.mockReturnValueOnce(new Promise((r) => (resolveSign = r)));

    const utils = render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(mockPlayers.length).toBe(1));
    loadAndPlayTo(8_000);

    await act(async () => {
      lastPlayer().onError("expired");
    });
    // The dying player reports again before the new URL arrives.
    await act(async () => {
      lastPlayer().onError("expired again");
    });
    expect(utils.queryByTestId("video-load-failed")).toBeNull();
    expect(mock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSign(playable("https://signed.example/new.mp4"));
    });
    await waitFor(() => expect(utils.getByText("https://signed.example/new.mp4")).toBeTruthy());
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
    data: { url, posterUrl: null, status: "analyzed", playability: "playable", matchId: MATCH, durationSeconds: 400 },
  };
}

function detailView(videos = 2) {
  const vids = [
    { id: "vid-1", uploaded_by: "me-1", uploaded_by_name: "Kai Reyes", is_mine: true, angle_label: "Your recording", playability: "playable", has_analysis: true },
    { id: "vid-2", uploaded_by: "opp-1", uploaded_by_name: "Mina Park", is_mine: false, angle_label: "Mina Park's recording", playability: "playable", has_analysis: false },
  ].slice(0, videos);
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
    technique_tags: [],
    completed_at: null,
  },
};

async function renderLoadedPlayer(opts: { videos?: number; analysis?: unknown } = {}) {
  queries().getMatchVideoPlaybackResult.mockResolvedValue(playableInMatch());
  mockUseMatchDetail.mockImplementation((id: string | undefined) =>
    id === MATCH ? detailView(opts.videos ?? 2) : { state: "loading", data: null, error: null, refreshing: false, refetch: jest.fn() },
  );
  mockGetVideoAnalysis.mockResolvedValue(opts.analysis ?? ANALYSIS);
  const utils = render(React.createElement(MatchVideoScreen));
  await waitFor(() => expect(mockPlayers.length).toBe(1));
  act(() => {
    lastPlayer().onPlaybackStatusUpdate({ isLoaded: true, positionMillis: 0, durationMillis: 400_000, shouldPlay: true });
  });
  return utils;
}

function statusAt(seconds: number) {
  act(() => {
    mockLatestProps.current!.onPlaybackStatusUpdate({ isLoaded: true, positionMillis: seconds * 1000, durationMillis: 400_000 });
  });
}

describe("MatchVideoScreen Film Room controls", () => {
  it("starts at ?t= by seeking on the first load", async () => {
    mockT = "27";
    queries().getMatchVideoPlaybackResult.mockResolvedValue(playableInMatch());
    render(React.createElement(MatchVideoScreen));
    await waitFor(() => expect(mockPlayers.length).toBe(1));
    act(() => {
      lastPlayer().onPlaybackStatusUpdate({ isLoaded: true, positionMillis: 0 });
    });
    expect(mockSetPosition).toHaveBeenCalledWith(27_000);
  });

  it("loads the match from the recording's match id and titles the player", async () => {
    const utils = await renderLoadedPlayer();
    expect(mockUseMatchDetail).toHaveBeenCalledWith(MATCH);
    expect(utils.getByText("K. Reyes vs M. Park")).toBeTruthy();
    expect(utils.getByText("RANKED")).toBeTruthy();
    expect(mockGetVideoAnalysis).toHaveBeenCalledWith({}, "vid-1");
  });

  it("marks every key moment on the seek bar and jumps from a chip", async () => {
    const utils = await renderLoadedPlayer();
    await waitFor(() => expect(utils.getByTestId("moment-chip-0")).toBeTruthy());
    // Engage, takedown, guard pass, and the finish at 06:17.
    expect(utils.getAllByTestId(/^seek-marker-/)).toHaveLength(4);
    expect(utils.getByText("4 KEY MOMENTS")).toBeTruthy();
    expect(utils.getByText("06:17 REAR-NAKED CHOKE · FINISH")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Jump to 00:27, Takedown"));
    expect(mockSetPosition).toHaveBeenLastCalledWith(27_000);
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
    expect(mockSetPosition).toHaveBeenLastCalledWith(40_000);
    fireEvent.press(utils.getByLabelText("Back 10 seconds"));
    expect(mockSetPosition).toHaveBeenLastCalledWith(30_000);
    statusAt(5);
    fireEvent.press(utils.getByLabelText("Back 10 seconds"));
    expect(mockSetPosition).toHaveBeenLastCalledWith(0);
  });

  it("pauses and cycles playback speed through the player props", async () => {
    const utils = await renderLoadedPlayer();
    expect(mockLatestProps.current!.shouldPlay).toBe(true);
    fireEvent.press(utils.getByLabelText("Pause"));
    expect(mockLatestProps.current!.shouldPlay).toBe(false);
    expect(utils.getByLabelText("Play")).toBeTruthy();

    expect(mockLatestProps.current!.rate).toBe(1);
    fireEvent.press(utils.getByLabelText("Playback speed, 1x"));
    expect(mockLatestProps.current!.rate).toBe(0.5);
    expect(utils.getByLabelText("Playback speed, 0.5x")).toBeTruthy();
    expect(mockLatestProps.current!.useNativeControls).toBeFalsy();
  });

  it("switches angle in place, carrying the current time", async () => {
    const utils = await renderLoadedPlayer();
    statusAt(42.6);
    expect(utils.getByLabelText("YOUR ANGLE").props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(utils.getByLabelText("M. PARK'S ANGLE"));
    expect(mockSetParams).toHaveBeenCalledWith({ id: "vid-2", t: "42" });
  });

  it("shows no angle switcher, chips or caption for one angle with no breakdown", async () => {
    const utils = await renderLoadedPlayer({ videos: 1, analysis: { ok: true, data: null } });
    expect(utils.queryByTestId("angle-switcher")).toBeNull();
    expect(utils.queryByTestId("moment-chip-0")).toBeNull();
    expect(utils.queryByTestId("player-caption")).toBeNull();
    expect(utils.getByTestId("player-seek")).toBeTruthy();
  });
});
