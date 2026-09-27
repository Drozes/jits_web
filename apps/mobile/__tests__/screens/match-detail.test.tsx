import * as React from "react";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";

// ---- mocks ----

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockMatchId = "11111111-1111-4111-8111-111111111111";

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

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
  useResolvedColorScheme: () => "light",
  useThemedTokens: () => ({
    accentCta: "#E63946",
    textSecondary: "#4B5563",
    textTertiary: "#575C68",
  }),
}));

// Opening a past match must not touch live state; the spy proves it.
const mockUseArenaMatchScreen = jest.fn();
jest.mock("@/lib/arena/arena-store", () => ({
  useArenaMatchScreen: () => mockUseArenaMatchScreen(),
}));

const mockGetMatchDetailView = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetailView: (...a: unknown[]) => mockGetMatchDetailView(...a),
}));

const mockGetVideoAnalysis = jest.fn();
jest.mock("@jits/shared/api/film-room", () => ({
  getVideoAnalysis: (...a: unknown[]) => mockGetVideoAnalysis(...a),
}));

const mockUseVideoProgress = jest.fn();
jest.mock("@jits/shared/hooks/use-video-progress", () => ({
  useVideoProgress: (_s: unknown, id: string | null) => mockUseVideoProgress(id),
}));

import MatchDetailScreen from "@/app/(app)/match-detail/[matchId]";
import { __resetSeenMatches, isMatchSeen } from "@/lib/film-room/seen-store";
import { resetMatchUploadStore, setMatchUpload } from "@/lib/video/match-upload-store";

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
    duration_seconds: 300,
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
        winner_id: "me-1",
        submission_name: "Rear-naked choke",
        finish_time_seconds: 237,
        dispute_locks_at: null,
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
      confirmations: [],
    },
  };
}

const ANALYSIS = {
  ok: true,
  data: {
    summary: "Blue shot a single leg at 00:27 and finished with a rear-naked choke.",
    analysis_tier: "premium",
    positions: [{ position: "standing", timestamp_s: 9 }],
    scoring_moments: [{ type: "takedown", timestamp_s: 27 }, { type: "back_take", timestamp_s: 200 }],
    technique_tags: [
      { id: "t1", technique_name: "Single leg", category: null, athlete_id: null, timestamp_start: 27, timestamp_end: null, submission_type_name: null },
      { id: "t2", technique_name: "RNC", category: null, athlete_id: null, timestamp_start: 237, timestamp_end: null, submission_type_name: null },
    ],
    completed_at: null,
  },
};

async function renderLoaded(result: unknown) {
  mockGetMatchDetailView.mockResolvedValue(result);
  const utils = render(React.createElement(MatchDetailScreen));
  await waitFor(() => expect(utils.queryByTestId("match-detail-loading")).toBeNull());
  return utils;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMatchId = "11111111-1111-4111-8111-111111111111";
  mockGetVideoAnalysis.mockResolvedValue({ ok: true, data: null });
  mockUseVideoProgress.mockReturnValue({ data: null, loading: false, error: null, rpcMissing: false, refresh: jest.fn() });
  __resetSeenMatches();
  resetMatchUploadStore();
});

/** The harness marker: exactly one, and a real (accessible) element for idb. */
function screenMarker(utils: ReturnType<typeof render>) {
  const markers = utils.getAllByTestId("match-detail-screen");
  expect(markers).toHaveLength(1);
  expect(markers[0].props.accessible).toBe(true);
  return markers[0];
}

function colorOf(el: { props: { style?: unknown } }): string | undefined {
  const flat = ([] as unknown[]).concat(el.props.style ?? []).flat(3) as Record<string, unknown>[];
  return flat.reduce<string | undefined>((c, s) => (s && typeof s.color === "string" ? s.color : c), undefined);
}

describe("MatchDetailScreen (Film Room match page)", () => {
  it("shows the skeleton while loading", () => {
    mockGetMatchDetailView.mockReturnValue(new Promise(() => undefined));
    const utils = render(React.createElement(MatchDetailScreen));
    expect(utils.getByTestId("match-detail-loading")).toBeTruthy();
    expect(utils.getByLabelText("Loading match")).toBeTruthy();
    expect(screenMarker(utils).props.accessibilityLabel).toBe("Match detail");
    // A way out even before the match loads.
    expect(utils.getByLabelText("Go back")).toBeTruthy();
  });

  it("renders a ranked win: YOU WON, ▲ delta in green, rating before/after, how it ended", async () => {
    const utils = await renderLoaded(view());
    expect(mockGetMatchDetailView).toHaveBeenCalledWith({}, mockMatchId, "me-1");
    expect(screenMarker(utils).props.accessibilityLabel).toBe("Match detail vs Demo Red");
    expect(utils.getByTestId("match-verdict")).toHaveTextContent("YOU WON");
    const delta = utils.getByTestId("match-elo-delta");
    expect(delta).toHaveTextContent("▲ +16");
    expect(colorOf(delta)).toBe("#22C55E");
    expect(utils.getByText("1200 → 1216")).toBeTruthy();
    expect(utils.getByTestId("match-verdict-line")).toHaveTextContent(
      "by Rear-naked choke · 03:57 · vs D. Red · Ranked · Sep 20",
    );
    expect(utils.getByText("RANKED")).toBeTruthy();
    expect(utils.queryByTestId("match-disputed-badge")).toBeNull();
  });

  it("reads a loss with ▼ and the red text color, and a draw as DRAW", async () => {
    const loss = await renderLoaded(view({ me: { outcome: "loss", elo_delta: -12 } }));
    expect(loss.getByTestId("match-verdict")).toHaveTextContent("YOU LOST");
    expect(loss.getByTestId("match-elo-delta")).toHaveTextContent("▼ −12");
    expect(colorOf(loss.getByTestId("match-elo-delta"))).toBe("#F0556B");
    loss.unmount();

    const draw = await renderLoaded(view({ me: { outcome: "draw", elo_delta: -4 }, match: { result: "draw" } }));
    expect(draw.getByTestId("match-verdict")).toHaveTextContent("DRAW");
  });

  it("says Casual, unrated instead of a delta for a casual match", async () => {
    const utils = await renderLoaded(view({ match: { match_type: "casual" } }));
    expect(utils.getByText("Casual, unrated")).toBeTruthy();
    expect(utils.getByText("CASUAL")).toBeTruthy();
    expect(utils.queryByTestId("match-elo-delta")).toBeNull();
  });

  it("flags a disputed result and still lists the film", async () => {
    const utils = await renderLoaded(view({ match: { status: "disputed" } }));
    expect(utils.getByTestId("match-disputed-badge")).toHaveTextContent("DISPUTED · UNDER REVIEW");
    expect(utils.getByTestId("match-video-watch-v-mine")).toBeTruthy();
  });

  it("shows a muted VOIDED or CANCELLED chip and no rating change", async () => {
    for (const [status, label] of [["voided", "VOIDED"], ["cancelled", "CANCELLED"]]) {
      const utils = await renderLoaded(view({ match: { status } }));
      expect(utils.getByTestId("match-muted-badge")).toHaveTextContent(label);
      expect(utils.queryByTestId("match-elo-delta")).toBeNull();
      expect(utils.getByText("Rating unchanged")).toBeTruthy();
      expect(utils.getByTestId("match-verdict")).toHaveTextContent("NO RESULT");
      utils.unmount();
    }
  });

  it("opens the opponent profile from the opponent row", async () => {
    const utils = await renderLoaded(view());
    fireEvent.press(utils.getByLabelText("View Demo Red's profile"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/athlete/opp-1");
  });

  it("keeps the harness Watch contract: one labelled row per angle", async () => {
    const utils = await renderLoaded(view({ videos: [video(), video(OPP_VIDEO)] }));
    const mine = utils.getByLabelText("Watch your recording");
    const theirs = utils.getByLabelText("Watch Demo Red's recording");
    expect(utils.getByTestId("match-video-watch-v-mine")).toBe(mine);
    expect(utils.getByTestId("match-video-watch-v-opp")).toBe(theirs);
    expect(within(theirs).getByText("D. RED'S ANGLE")).toBeTruthy();
    expect(utils.getByText("FILM · 2 ANGLES")).toBeTruthy();
    fireEvent.press(theirs);
    expect(mockPush).toHaveBeenCalledWith("/(app)/video/v-opp");
  });

  it("disables Watch while a recording is still uploading and keeps it on a failed one", async () => {
    const utils = await renderLoaded(
      view({ videos: [video({ status: "uploading", playability: "processing" }), video({ ...OPP_VIDEO, status: "failed", playability: "failed" })] }),
    );
    const processing = utils.getByLabelText("Processing");
    expect(processing.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(processing);
    expect(mockPush).not.toHaveBeenCalled();
    expect(utils.getByText("UPLOADING")).toBeTruthy();
    expect(utils.getByText("ANALYSIS FAILED · MAY STILL PLAY")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Watch Demo Red's recording"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/video/v-opp");
    // The selected angle (mine) cannot play yet, so the hero has no play.
    expect(utils.queryByLabelText("Play match film")).toBeNull();
  });

  it("uses the signed opening still as the hero, cached by its storage key, and plays from it", async () => {
    const utils = await renderLoaded(
      view({ videos: [video({ poster_url: "https://signed/p.jpg", thumbnail_key: "m1/me/poster.jpg" })] }),
    );
    const still = utils.getByTestId("match-hero-still");
    // Keyed by the poster's storage path: a regenerated poster is a new key.
    expect(still.props.source).toEqual({ uri: "https://signed/p.jpg", cacheKey: "film-still-m1/me/poster.jpg" });
    expect(utils.getByText("OPENING STILL")).toBeTruthy();
    expect(utils.getByText("05:00")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Play match film"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/video/v-mine");
  });

  it("falls back to both athletes on the plate until the still arrives", async () => {
    const utils = await renderLoaded(view());
    const plate = utils.getByTestId("match-hero-still-fallback");
    expect(utils.getByText("STILL ARRIVES AFTER UPLOAD")).toBeTruthy();
    expect(within(plate).getByLabelText("Demo Blue")).toBeTruthy();
    expect(within(plate).getByLabelText("Demo Red")).toBeTruthy();
  });

  it("shows this phone's upload progress in the fallback while the clip uploads", async () => {
    act(() => {
      setMatchUpload(mockMatchId, { status: "uploading", progress: 0.64 });
    });
    const utils = await renderLoaded(view({ videos: [] }));
    expect(utils.getByText("UPLOADING 64% · STILL ARRIVES AFTER UPLOAD")).toBeTruthy();
    expect(utils.getByText("The breakdown starts once the film finishes uploading.")).toBeTruthy();
  });

  it("shows the no-video plate when nothing was recorded", async () => {
    const utils = await renderLoaded(view({ videos: [] }));
    expect(utils.getByTestId("match-detail-no-video")).toBeTruthy();
    expect(utils.getByText("NO FILM RECORDED")).toBeTruthy();
    expect(utils.queryByLabelText("Play match film")).toBeNull();
    expect(utils.queryByTestId("ai-breakdown")).toBeNull();
  });

  it("renders the AI breakdown, key moments (tap opens the player at t) and technique tags", async () => {
    mockGetVideoAnalysis.mockResolvedValue(ANALYSIS);
    const utils = await renderLoaded(view({ videos: [video({ has_analysis: true, status: "analyzed" })] }));
    await waitFor(() => expect(utils.getByText(ANALYSIS.data.summary)).toBeTruthy());
    expect(mockGetVideoAnalysis).toHaveBeenCalledWith({}, "v-mine");
    expect(utils.getByText("PREMIUM")).toBeTruthy();
    expect(utils.getByText("KEY MOMENTS")).toBeTruthy();
    // Decorative: hidden from assistive tech, the rows carry the actions.
    expect(utils.getByTestId("moment-timeline", { includeHiddenElements: true })).toBeTruthy();
    // Engage, takedown, and the last scoring moment promoted to the finish
    // (video time 03:20). The match clock's 03:57 is never placed on it.
    expect(utils.getByLabelText("Play from 00:09, Engage")).toBeTruthy();
    expect(utils.getByLabelText("Play from 03:20, Rear-naked choke")).toBeTruthy();
    expect(utils.queryByLabelText(/^Play from 03:57/)).toBeNull();
    expect(utils.getByText("FINISH")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Play from 00:27, Takedown"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/video/v-mine?t=27");
    expect(within(utils.getByTestId("technique-tags")).getByText("Single leg")).toBeTruthy();
    expect(within(utils.getByTestId("technique-tags")).getByText("RNC")).toBeTruthy();
  });

  it("shows live analysis progress while the chunks run", async () => {
    mockUseVideoProgress.mockImplementation((id: string | null) => ({
      data: id ? { status: "analyzing", chunk_count: 7, chunks_completed: 3 } : null,
      loading: false,
      error: null,
      rpcMissing: false,
      refresh: jest.fn(),
    }));
    const utils = await renderLoaded(view({ videos: [video({ status: "analyzing" })] }));
    expect(mockUseVideoProgress).toHaveBeenCalledWith("v-mine");
    expect(utils.getByTestId("breakdown-analyzing")).toHaveTextContent("ANALYZING 3/7");
    expect(mockGetVideoAnalysis).not.toHaveBeenCalled();
  });

  it("reads the breakdown the moment live progress says the merge landed", async () => {
    mockUseVideoProgress.mockImplementation((id: string | null) => ({
      data: id ? { status: "analyzed", chunk_count: 7, chunks_completed: 7 } : null,
      loading: false,
      error: null,
      rpcMissing: false,
      refresh: jest.fn(),
    }));
    mockGetVideoAnalysis.mockResolvedValue(ANALYSIS);
    const utils = await renderLoaded(view({ videos: [video({ status: "merging" })] }));
    await waitFor(() => expect(utils.getByText(ANALYSIS.data.summary)).toBeTruthy());
  });

  it("switches angle: hero, breakdown and moments follow the selected recording", async () => {
    mockGetVideoAnalysis.mockImplementation(async (_c: unknown, id: string) =>
      id === "v-opp" ? ANALYSIS : { ok: true, data: null },
    );
    const utils = await renderLoaded(
      view({
        videos: [
          video({ poster_url: "https://signed/mine.jpg" }),
          video({ ...OPP_VIDEO, poster_url: "https://signed/opp.jpg", has_analysis: true, status: "analyzed" }),
        ],
      }),
    );
    expect(utils.getByTestId("match-hero-still").props.source.uri).toBe("https://signed/mine.jpg");
    expect(utils.getByText("No breakdown for this recording yet.")).toBeTruthy();

    fireEvent.press(utils.getByLabelText("D. RED'S ANGLE"));
    expect(utils.getByTestId("match-hero-still").props.source.uri).toBe("https://signed/opp.jpg");
    await waitFor(() => expect(utils.getByText(ANALYSIS.data.summary)).toBeTruthy());
    fireEvent.press(utils.getByLabelText("Play from 00:27, Takedown"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/video/v-opp?t=27");
  });

  it("has no angle switcher with a single recording", async () => {
    const utils = await renderLoaded(view());
    expect(utils.queryByTestId("angle-switcher")).toBeNull();
  });

  it("marks the match seen so the Film Room drops its NEW badge", async () => {
    expect(isMatchSeen(mockMatchId)).toBe(false);
    await renderLoaded(view());
    expect(isMatchSeen(mockMatchId)).toBe(true);
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
