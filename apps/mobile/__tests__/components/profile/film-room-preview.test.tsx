import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
// The server Film status phases are their own suite (use-film-room-phases.test).
jest.mock("@/lib/film-room/use-film-room-phases", () => ({ useFilmRoomPhases: () => ({}) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: unknown, p: string) => (p === "__esModule" ? true : stub) });
});
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});
jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "light",
  useThemedTokens: () => ({ textSecondary: "#4B5563" }),
}));

import { FilmRoomPreview, PREVIEW_COUNT } from "@/components/profile/film-room-preview";
import { resetMatchUploadStore, setMatchUpload } from "@/lib/video/match-upload-store";
import { loadSeenMatches } from "@/lib/film-room/seen-store";
import { libItem } from "../../support/film-fixtures";

const viewer = { name: "Kai Reyes", photoUrl: null };

beforeEach(async () => {
  jest.clearAllMocks();
  resetMatchUploadStore();
  // Read the seen set up front so its async load never lands mid-test.
  await loadSeenMatches();
});

describe("FilmRoomPreview", () => {
  it("opens the Film Room from its entry row", () => {
    const utils = render(<FilmRoomPreview items={[]} error={false} onRetry={jest.fn()} viewer={viewer} />);
    fireEvent.press(utils.getByLabelText("Open Film Room"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/film-room");
    expect(utils.getByTestId("past-videos-empty")).toBeTruthy();
  });

  it("shows the newest filmed matches with the harness row contract", () => {
    const items = [
      libItem({ match_id: "no-film", videos: [] }),
      ...Array.from({ length: PREVIEW_COUNT + 2 }, (_, i) => libItem({ match_id: `m-${i}` })),
    ];
    const utils = render(<FilmRoomPreview items={items} error={false} onRetry={jest.fn()} viewer={viewer} />);
    // Matches without film stay in the Film Room, not the preview.
    expect(utils.queryByTestId("past-video-row-no-film")).toBeNull();
    expect(utils.getAllByTestId(/^past-video-row-/)).toHaveLength(PREVIEW_COUNT);
    const row = utils.getByTestId("past-video-row-m-0");
    expect(row.props.accessibilityLabel).toBe("Open match video vs Mina Park");
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/m-0");
  });

  it("keeps badges short on the narrow tiles", () => {
    const utils = render(
      <FilmRoomPreview
        items={[libItem({ match_id: "two", completed_at: new Date().toISOString(), videos: [libItem().videos[0], { ...libItem().videos[0], video_id: "v-2" }] })]}
        error={false}
        onRetry={jest.fn()}
        viewer={viewer}
      />,
    );
    // Seen set is empty and the match is fresh: NEW, plus the angle count.
    expect(utils.getByText("NEW")).toBeTruthy();
    expect(utils.getByText("2×")).toBeTruthy();
    expect(utils.queryByText("2 ANGLES")).toBeNull();
  });

  it("includes a match whose film is still uploading from this phone", () => {
    act(() => {
      setMatchUpload("fresh", { status: "uploading", progress: 0.4 });
    });
    const utils = render(
      <FilmRoomPreview items={[libItem({ match_id: "fresh", videos: [] })]} error={false} onRetry={jest.fn()} viewer={viewer} />,
    );
    expect(utils.getByTestId("past-video-row-fresh")).toBeTruthy();
    expect(utils.getByText("UPLOADING 40%")).toBeTruthy();
  });

  it("offers a retry when the first load failed", () => {
    const onRetry = jest.fn();
    const utils = render(<FilmRoomPreview items={undefined} error onRetry={onRetry} viewer={viewer} />);
    fireEvent.press(utils.getByTestId("past-videos-error"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders nothing but the entry while cold-loading", () => {
    const utils = render(<FilmRoomPreview items={undefined} error={false} onRetry={jest.fn()} viewer={viewer} />);
    expect(utils.getByLabelText("Open Film Room")).toBeTruthy();
    expect(utils.queryByTestId("film-room-preview")).toBeNull();
    expect(utils.queryByTestId("past-videos-empty")).toBeNull();
  });
});
