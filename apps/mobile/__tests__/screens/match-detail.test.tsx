import * as React from "react";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";

// ---- mocks ----

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockMatchId = "11111111-1111-4111-8111-111111111111";
let mockScheme: "light" | "dark" = "light";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ matchId: mockMatchId }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => true,
  }),
  useFocusEffect: jest.fn(),
}));

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    { get: (_t: unknown, prop: string) => (prop === "__esModule" ? true : stub) },
  );
});

jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});

jest.mock("@/components/ui/skeleton", () => {
  const R = require("react");
  const RN = require("react-native");
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    R.createElement(RN.View, null, children);
  return { SkeletonProvider: Pass, SkeletonBlock: () => R.createElement(RN.View) };
});

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: { id: "me-1" }, user: { id: "u" }, isLoading: false }),
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => mockScheme,
  useThemedTokens: () => ({
    accentCta: "#E63946",
    textSecondary: "#4B5563",
    textTertiary: "#575C68",
  }),
}));

jest.mock("@/components/layout/app-header", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    AppHeader: ({ title }: { title: string }) =>
      R.createElement(RN.Text, { testID: "app-header" }, title),
  };
});

// Opening a past match must not touch live state; the spy proves it.
const mockUseArenaMatchScreen = jest.fn();
jest.mock("@/lib/arena/arena-store", () => ({
  useArenaMatchScreen: () => mockUseArenaMatchScreen(),
}));

const mockGetMatchDetailView = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetailView: (...a: unknown[]) => mockGetMatchDetailView(...a),
}));

import MatchDetailScreen from "@/app/(app)/match-detail/[matchId]";

// ---- fixtures ----

function participant(over: Record<string, unknown> = {}) {
  return {
    athlete_id: "me-1",
    display_name: "Demo Blue",
    current_elo: 1210,
    current_weight: 170,
    profile_photo_url: null,
    role: "challenger",
    outcome: "win",
    elo_before: 1200,
    elo_after: 1216,
    elo_delta: 16,
    weight_division_gap: 0,
    ...over,
  };
}

function video(over: Record<string, unknown> = {}) {
  return {
    id: "v-mine",
    uploaded_by: "me-1",
    uploaded_by_name: "Demo Blue",
    status: "ready",
    playability: "playable",
    duration_seconds: 185,
    camera_angle: null,
    has_analysis: false,
    is_mine: true,
    angle_label: "Your recording",
    poster_url: null,
    ...over,
  };
}

const OPP_VIDEO = {
  id: "v-opp",
  uploaded_by: "opp-1",
  uploaded_by_name: "Demo Red",
  is_mine: false,
  angle_label: "Demo Red's recording",
};

function view(over: {
  match?: Record<string, unknown>;
  me?: Record<string, unknown>;
  videos?: unknown[];
} = {}) {
  return {
    ok: true,
    data: {
      match: {
        id: mockMatchId,
        challenge_id: null,
        session_id: null,
        match_type: "ranked",
        duration_seconds: 300,
        status: "completed",
        result: "submission",
        started_at: "2026-09-20T10:00:00Z",
        completed_at: "2026-09-20T10:05:00Z",
        paused_at: null,
        total_paused_duration: 0,
        timekeeper_id: null,
        ...over.match,
      },
      me: participant(over.me),
      opponent: participant({
        athlete_id: "opp-1",
        display_name: "Demo Red",
        current_elo: 1190,
        outcome: "loss",
        elo_delta: -16,
      }),
      videos: over.videos ?? [video()],
    },
  };
}

async function renderLoaded(result: unknown) {
  mockGetMatchDetailView.mockResolvedValue(result);
  const utils = render(React.createElement(MatchDetailScreen));
  await waitFor(() => expect(utils.queryByTestId("match-detail-loading")).toBeNull());
  return utils;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMatchId = "11111111-1111-4111-8111-111111111111";
  mockScheme = "light";
});

/** The harness marker: exactly one, and a real (accessible) element for idb. */
function screenMarker(utils: ReturnType<typeof render>) {
  const markers = utils.getAllByTestId("match-detail-screen");
  expect(markers).toHaveLength(1);
  expect(markers[0].props.accessible).toBe(true);
  return markers[0];
}

describe("MatchDetailScreen", () => {
  it("shows the skeleton while loading", () => {
    mockGetMatchDetailView.mockReturnValue(new Promise(() => undefined));
    const utils = render(React.createElement(MatchDetailScreen));
    expect(utils.getByTestId("match-detail-loading")).toBeTruthy();
    expect(utils.getByLabelText("Loading match")).toBeTruthy();
    expect(screenMarker(utils).props.accessibilityLabel).toBe("Match detail");
  });

  it("renders a ranked win: verdict, green delta, rating before/after, meta", async () => {
    const utils = await renderLoaded(view());
    expect(mockGetMatchDetailView).toHaveBeenCalledWith({}, mockMatchId, "me-1");
    expect(screenMarker(utils).props.accessibilityLabel).toBe(
      "Match detail vs Demo Red",
    );
    expect(utils.getByTestId("match-verdict")).toHaveTextContent("WIN");
    const delta = utils.getByTestId("match-elo-delta");
    expect(delta).toHaveTextContent("+16");
    expect(delta.props.className).toContain("text-positive");
    expect(utils.getByText("1200 → 1216")).toBeTruthy();
    expect(utils.getByText("RANKED")).toBeTruthy();
    expect(utils.getByText("5:00")).toBeTruthy();
    expect(utils.getByText("Submission")).toBeTruthy();
    expect(utils.queryByTestId("match-disputed-badge")).toBeNull();
  });

  it("colors a loss red and a draw amber", async () => {
    const loss = await renderLoaded(view({ me: { outcome: "loss", elo_delta: -12 } }));
    expect(loss.getByTestId("match-verdict").props.className).toContain("text-negative");
    expect(loss.getByTestId("match-elo-delta").props.className).toContain("text-negative");
    loss.unmount();

    const draw = await renderLoaded(view({ me: { outcome: "draw", elo_delta: -4 } }));
    expect(draw.getByTestId("match-verdict")).toHaveTextContent("DRAW");
    // Light surfaces get the darker amber for contrast.
    expect(draw.getByTestId("match-verdict").props.className).toContain("text-amber-600");
    expect(draw.getByTestId("match-elo-delta").props.className).toContain("text-amber-600");
    draw.unmount();

    mockScheme = "dark";
    const dark = await renderLoaded(view({ me: { outcome: "draw", elo_delta: -4 } }));
    expect(dark.getByTestId("match-verdict").props.className).toContain("text-amber-500");
    expect(dark.getByTestId("match-elo-delta").props.className).toContain("text-amber-500");
  });

  it("says Casual, unrated instead of a delta for a casual match", async () => {
    const utils = await renderLoaded(view({ match: { match_type: "casual" } }));
    expect(utils.getByText("Casual, unrated")).toBeTruthy();
    expect(utils.getByText("CASUAL")).toBeTruthy();
    expect(utils.queryByTestId("match-elo-delta")).toBeNull();
  });

  it("shows the amber DISPUTED badge and still lists the videos", async () => {
    const utils = await renderLoaded(view({ match: { status: "disputed" } }));
    expect(utils.getByTestId("match-disputed-badge")).toBeTruthy();
    expect(utils.getByText("This result is disputed and under review.")).toBeTruthy();
    expect(utils.getByTestId("match-video-card-v-mine")).toBeTruthy();
  });

  it("opens the opponent profile from the opponent row", async () => {
    const utils = await renderLoaded(view());
    fireEvent.press(utils.getByLabelText("View Demo Red's profile"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/athlete/opp-1");
    // Avatars stay circular on this row.
    expect(utils.getByLabelText("Demo Red").props.className).toContain("rounded-full");
  });

  it("renders two labelled cards with exactly one primary Watch", async () => {
    const utils = await renderLoaded(view({ videos: [video(), video(OPP_VIDEO)] }));
    expect(utils.getByText("Match videos")).toBeTruthy();
    const mine = utils.getByLabelText("Watch your recording");
    const theirs = utils.getByLabelText("Watch Demo Red's recording");
    expect(mine.props.className).toContain("bg-cta");
    expect(theirs.props.className).not.toContain("bg-cta");
    expect(within(utils.getByTestId("match-video-card-v-opp")).getByText("Demo Red's recording")).toBeTruthy();

    // Harness tap targets: one per Watch, keyed by video id.
    expect(utils.getByTestId("match-video-watch-v-mine")).toBe(mine);
    fireEvent.press(utils.getByTestId("match-video-watch-v-opp"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/video/v-opp");
  });

  it("gives the primary Watch to the first watchable card when mine is uploading", async () => {
    const utils = await renderLoaded(
      view({ videos: [video({ status: "uploading", playability: "processing" }), video(OPP_VIDEO)] }),
    );
    expect(utils.getByText("UPLOADING").props.className).toContain("text-amber-600");
    expect(utils.getByText("Still uploading. Pull down to refresh.")).toBeTruthy();
    const processing = utils.getByLabelText("Processing");
    expect(processing.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(processing);
    expect(mockPush).not.toHaveBeenCalled();
    expect(utils.getByLabelText("Watch Demo Red's recording").props.className).toContain("bg-cta");
  });

  it("keeps Watch on a failed-status video with a note", async () => {
    const utils = await renderLoaded(view({ videos: [video({ status: "failed", playability: "failed" })] }));
    expect(utils.getByText("Processing failed. The original recording may still play.")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Watch your recording"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/video/v-mine");
  });

  it("shows the poster when there is one, the placeholder otherwise", async () => {
    const utils = await renderLoaded(
      view({ videos: [video({ poster_url: "https://signed/p.jpg" }), video(OPP_VIDEO)] }),
    );
    const poster = within(utils.getByTestId("match-video-card-v-mine")).getByTestId("match-video-poster");
    // Cached by video id so a re-signed URL on refetch does not flash.
    expect(poster.props.source).toEqual({
      uri: "https://signed/p.jpg",
      cacheKey: "match-video-poster-v-mine",
    });
    expect(poster.props.recyclingKey).toBe("v-mine");
    expect(within(utils.getByTestId("match-video-card-v-opp")).getByTestId("match-video-placeholder")).toBeTruthy();
  });

  it("shows the no-video plate when nothing was recorded", async () => {
    const utils = await renderLoaded(view({ videos: [] }));
    expect(utils.getByTestId("match-detail-no-video")).toBeTruthy();
    expect(utils.getByText("No video was recorded for this match.")).toBeTruthy();
  });

  it("explains NOT_PARTICIPANT and goes back", async () => {
    const utils = await renderLoaded({ ok: false, error: { code: "NOT_PARTICIPANT", message: "x" } });
    expect(utils.getByTestId("match-detail-not-participant")).toBeTruthy();
    expect(utils.getByText("You can't view this match")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("shows not found for MATCH_NOT_FOUND", async () => {
    const utils = await renderLoaded({ ok: false, error: { code: "MATCH_NOT_FOUND", message: "x" } });
    expect(utils.getByTestId("match-detail-not-found")).toBeTruthy();
    expect(utils.getByText("Match not found")).toBeTruthy();
  });

  it("offers Try again on any other error and refetches", async () => {
    const utils = await renderLoaded({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    expect(utils.getByTestId("match-detail-error")).toBeTruthy();
    mockGetMatchDetailView.mockResolvedValue(view());
    await act(async () => {
      fireEvent.press(utils.getByLabelText("Try again"));
    });
    await waitFor(() => expect(utils.getByTestId("match-verdict")).toBeTruthy());
    expect(mockGetMatchDetailView).toHaveBeenCalledTimes(2);
  });

  it("never marks the athlete as in a match", async () => {
    await renderLoaded(view());
    expect(mockUseArenaMatchScreen).not.toHaveBeenCalled();
    // And statically: the screen imports neither the arena store nor the wizard.
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "../../app/(app)/match-detail/[matchId].tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/from "@\/lib\/arena\//);
    expect(src).not.toMatch(/components\/match-flow/);
  });
});
