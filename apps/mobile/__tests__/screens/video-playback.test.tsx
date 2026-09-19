import * as React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

// ---- mocks ----

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "vid-1" }),
}));

jest.mock("expo-av", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    ResizeMode: { CONTAIN: "contain" },
    Video: ({ source }: { source: { uri: string } }) =>
      R.createElement(RN.Text, { testID: "video-player" }, source.uri),
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
}));

import MatchVideoScreen from "@/app/(app)/video/[id]";

interface QueryMocks {
  getMatchVideoSignedUrl: jest.Mock;
  getMatchVideoSignedUrlResult: jest.Mock;
}

function queries() {
  return require("@jits/shared/api/queries") as QueryMocks;
}

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * "The recording is not there" and "we could not find out" are different
 * statements, and this screen makes one of them to the athlete (jits-icei.5).
 *
 * getMatchVideoSignedUrl collapsed both into null, so a transient PostgREST
 * failure rendered "Video Unavailable" and told an athlete their match video
 * does not exist, with no way to retry. The Result variant separates them.
 *
 * Every failure below is a RESOLVED `{ ok: false }`, never a rejection:
 * supabase-js does not reject, so a mockRejectedValue here would exercise a
 * path production cannot produce.
 */
describe("MatchVideoScreen", () => {
  it("plays the video when a signed URL comes back", async () => {
    queries().getMatchVideoSignedUrlResult.mockResolvedValue({
      ok: true,
      data: "https://signed.example/v.mp4",
    });

    const { getByTestId } = render(React.createElement(MatchVideoScreen));
    await waitFor(() => {
      expect(getByTestId("video-player")).toBeTruthy();
    });
  });

  it("shows the empty state when the read worked and there is no recording", async () => {
    queries().getMatchVideoSignedUrlResult.mockResolvedValue({
      ok: true,
      data: null,
    });

    const { getByTestId } = render(React.createElement(MatchVideoScreen));
    await waitFor(() => {
      expect(getByTestId("video-unavailable")).toBeTruthy();
    });
  });

  it("shows a retryable failure, NOT the empty state, when the read fails", async () => {
    queries().getMatchVideoSignedUrlResult.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "connection failure" },
    });

    const { getByTestId, queryByTestId } = render(
      React.createElement(MatchVideoScreen),
    );
    await waitFor(() => {
      expect(getByTestId("video-load-failed")).toBeTruthy();
    });
    // The distinction is the whole point: a failed read must never claim the
    // recording does not exist.
    expect(queryByTestId("video-unavailable")).toBeNull();
  });

  it("reads through the Result query, not the null-collapsing one", async () => {
    queries().getMatchVideoSignedUrlResult.mockResolvedValue({
      ok: true,
      data: "https://signed.example/v.mp4",
    });

    render(React.createElement(MatchVideoScreen));
    await waitFor(() => {
      expect(queries().getMatchVideoSignedUrlResult).toHaveBeenCalled();
    });
    // Reverting to getMatchVideoSignedUrl would restore the bug while every
    // happy-path assertion kept passing, so guard it explicitly.
    expect(queries().getMatchVideoSignedUrl).not.toHaveBeenCalled();
  });

  it("retries the read when the athlete asks", async () => {
    const mock = queries().getMatchVideoSignedUrlResult;
    mock.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "connection failure" },
    });

    const { getByTestId, getByLabelText } = render(
      React.createElement(MatchVideoScreen),
    );
    await waitFor(() => {
      expect(getByTestId("video-load-failed")).toBeTruthy();
    });

    mock.mockResolvedValue({ ok: true, data: "https://signed.example/v.mp4" });
    await act(async () => {
      fireEvent.press(getByLabelText("Retry loading video"));
    });

    await waitFor(() => {
      expect(getByTestId("video-player")).toBeTruthy();
    });
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
