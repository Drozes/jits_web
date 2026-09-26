/**
 * Past Match Videos (jits-5tj9.8): one row per match, disputed and
 * processing states in the subtitle, a show-all toggle, a retry row on
 * error, and rows that open the match detail screen.
 *
 * Source: apps/mobile/components/profile/past-match-videos.tsx
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import type { MatchVideoListItem } from "@jits/shared/api/queries";
import type { MyMatchVideos } from "@/lib/profile/use-my-match-videos";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View, {});
  return new Proxy(
    {},
    { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : stub) },
  );
});

import { PastMatchVideos } from "@/components/profile/past-match-videos";

function item(overrides: Partial<MatchVideoListItem> = {}): MatchVideoListItem {
  return {
    match_id: "m-1",
    match_status: "completed",
    match_type: "ranked",
    match_date: new Date().toISOString(),
    opponent_id: "opp-1",
    opponent_name: "Demo Red",
    outcome: "win",
    video_count: 1,
    playable_count: 1,
    latest_video_at: new Date().toISOString(),
    ...overrides,
  };
}

function videos(overrides: Partial<MyMatchVideos> = {}): MyMatchVideos {
  return {
    items: [],
    isLoading: false,
    isValidating: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => mockPush.mockClear());

describe("PastMatchVideos", () => {
  it("renders one row for a match with two videos, labelled 2 videos", () => {
    const { getByTestId, getByText } = render(
      <PastMatchVideos videos={videos({ items: [item({ video_count: 2, playable_count: 2 })] })} />,
    );
    getByTestId("past-video-row-m-1");
    getByText("vs Demo Red");
    getByText(/2 videos/);
  });

  it("marks a disputed match", () => {
    const { getByText } = render(
      <PastMatchVideos videos={videos({ items: [item({ match_status: "disputed" })] })} />,
    );
    getByText(/Disputed/);
  });

  it("marks a match whose videos are all still processing", () => {
    const { getByText, queryByText } = render(
      <PastMatchVideos videos={videos({ items: [item({ playable_count: 0 })] })} />,
    );
    getByText(/Processing/);
    expect(queryByText(/Disputed/)).toBeNull();
  });

  it("falls back to Opponent when the opponent is unknown", () => {
    const { getByLabelText } = render(
      <PastMatchVideos videos={videos({ items: [item({ opponent_name: null })] })} />,
    );
    getByLabelText("Open match video vs Opponent");
  });

  it("opens the match detail screen on press", () => {
    const { getByLabelText } = render(
      <PastMatchVideos videos={videos({ items: [item({ match_id: "m-9" })] })} />,
    );
    fireEvent.press(getByLabelText("Open match video vs Demo Red"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/m-9");
  });

  it("shows the first 5 and toggles the rest in place", () => {
    const items = Array.from({ length: 7 }, (_, i) => item({ match_id: `m-${i}` }));
    const { getByText, queryByTestId, getByTestId } = render(
      <PastMatchVideos videos={videos({ items })} />,
    );
    getByTestId("past-video-row-m-4");
    expect(queryByTestId("past-video-row-m-5")).toBeNull();

    fireEvent.press(getByText("Show all (7)"));
    getByTestId("past-video-row-m-6");

    fireEvent.press(getByText("Show fewer"));
    expect(queryByTestId("past-video-row-m-6")).toBeNull();
  });

  it("does not offer the toggle for 5 or fewer matches", () => {
    const items = Array.from({ length: 5 }, (_, i) => item({ match_id: `m-${i}` }));
    const { queryByTestId } = render(<PastMatchVideos videos={videos({ items })} />);
    expect(queryByTestId("past-videos-toggle")).toBeNull();
  });

  it("shows a retry row on error instead of hiding", () => {
    const refetch = jest.fn();
    const { getByText } = render(
      <PastMatchVideos videos={videos({ error: new Error("boom"), refetch })} />,
    );
    getByText("Past Match Videos");
    fireEvent.press(getByText("Couldn't load your videos. Tap to retry."));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps showing the list when a background refresh fails", () => {
    const { getByTestId, queryByTestId } = render(
      <PastMatchVideos videos={videos({ items: [item()], error: new Error("boom") })} />,
    );
    getByTestId("past-video-row-m-1");
    expect(queryByTestId("past-videos-error")).toBeNull();
  });

  it("renders nothing when there are no videos", () => {
    const { toJSON } = render(<PastMatchVideos videos={videos()} />);
    expect(toJSON()).toBeNull();
  });

  it("renders nothing while cold-loading", () => {
    const { toJSON } = render(<PastMatchVideos videos={videos({ isLoading: true })} />);
    expect(toJSON()).toBeNull();
  });
});
