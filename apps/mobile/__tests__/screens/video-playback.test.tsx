import * as React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

// ---- mocks ----

const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "vid-1" }),
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => true }),
}));

/**
 * The fake player records the props of every mount so a test can fire the
 * player's own callbacks (onError, onPlaybackStatusUpdate) and see the seek
 * that follows a silent re-sign.
 */
const mockSetPosition = jest.fn(async () => undefined);
const mockPlayers: Array<Record<string, any>> = [];

jest.mock("expo-av", () => {
  const R = require("react");
  const RN = require("react-native");
  const Video = R.forwardRef((props: Record<string, any>, ref: unknown) => {
    R.useImperativeHandle(ref, () => ({ setPositionAsync: mockSetPosition }));
    R.useEffect(() => {
      mockPlayers.push(props);
    }, []);
    return R.createElement(RN.Text, { testID: "video-player" }, props.source.uri);
  });
  return { ResizeMode: { CONTAIN: "contain" }, Video };
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
  return utils.getByTestId("video-player-state").props.accessibilityLabel;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayers.length = 0;
});

/**
 * Every failure below is a RESOLVED `{ ok: false }`, never a rejection:
 * supabase-js does not reject, so a mockRejectedValue here would exercise a
 * path production cannot produce (jits-icei.5).
 */
describe("MatchVideoScreen", () => {
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
    act(() => {
      lastPlayer().onPlaybackStatusUpdate({ isLoaded: true, positionMillis: 42_000 });
    });

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

    await act(async () => {
      lastPlayer().onError("bad");
    });
    await waitFor(() => expect(mockPlayers.length).toBe(2));
    expect(stateLabel(utils)).toBe("Video state: loading");

    await act(async () => {
      lastPlayer().onError("bad again");
    });
    expect(utils.getByTestId("video-load-failed")).toBeTruthy();
    expect(stateLabel(utils)).toBe("Video state: error");
    // One initial sign plus exactly one silent re-sign.
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
