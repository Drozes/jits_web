import * as React from "react";
import { act, configure, fireEvent, render, waitFor, within } from "@testing-library/react-native";

// Same load-sensitivity guard as film-room.test.tsx: this suite timed out on
// its 1 s waitFor under a loaded pre-commit run and passes alone in ~9 s.
jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 5_000 });

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

let mockScheme: "light" | "dark" = "light";
jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => mockScheme,
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

// The highlight card's shared progress hook (realtime + RPC). `null` data is
// "not loaded / read failed", which renders no card, so the suites above
// this block see the screen exactly as before.
let mockHighlightByVideo: Record<string, unknown> = {};
const mockHighlightRefresh = jest.fn();
const mockUseHighlightProgress = jest.fn((_client: unknown, id: string | null) => ({
  data: (id && mockHighlightByVideo[id]) ?? null,
  loading: false,
  error: null,
  refresh: mockHighlightRefresh,
}));
jest.mock("@jits/shared/hooks/use-highlight-progress", () => ({
  useHighlightProgress: (...a: [unknown, string | null]) => mockUseHighlightProgress(...a),
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
import { paletteFor } from "@/lib/theme/palette";

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
  mockHighlightByVideo = {};
  mockScheme = "light";
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
    // The light theme's gain green (the page follows the app theme).
    expect(colorOf(delta)).toBe("#116A33");
    expect(utils.getByText("1200 → 1216")).toBeTruthy();
    expect(utils.getByTestId("match-verdict-line")).toHaveTextContent(
      "by Rear-naked choke · 03:57 · vs D. Red · Sep 20",
    );
    expect(utils.queryByText(/ranked/i)).toBeNull();
    expect(utils.queryByTestId("match-disputed-badge")).toBeNull();
  });

  it("reads a loss with ▼ and the red text color, and a draw as DRAW", async () => {
    const loss = await renderLoaded(view({ me: { outcome: "loss", elo_delta: -12 } }));
    expect(loss.getByTestId("match-verdict")).toHaveTextContent("YOU LOST");
    expect(loss.getByTestId("match-elo-delta")).toHaveTextContent("▼ −12");
    expect(colorOf(loss.getByTestId("match-elo-delta"))).toBe("#AC2B34");
    loss.unmount();

    const draw = await renderLoaded(view({ me: { outcome: "draw", elo_delta: -4 }, match: { result: "draw" } }));
    expect(draw.getByTestId("match-verdict")).toHaveTextContent("DRAW");
  });

  it("renders a legacy casual match like any match: no kind tag, no delta when none was recorded, never casual", async () => {
    const utils = await renderLoaded(
      // Real backend shape: elo_delta is NOT NULL DEFAULT 0, elo_after NULL.
      view({ match: { match_type: "casual" }, me: { elo_delta: 0, elo_before: null, elo_after: null } }),
    );
    expect(utils.queryByText(/casual/i)).toBeNull();
    expect(utils.queryByText(/ranked/i)).toBeNull();
    expect(utils.queryByTestId("match-elo-delta")).toBeNull();
    expect(utils.queryByText(/± 0/)).toBeNull();
    expect(utils.getByTestId("match-verdict-line")).not.toHaveTextContent(/ranked|casual/i);
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
    // The video is on the server, so the upload is done: the still is
    // waiting on processing, never "after upload" (jits-n2im.4 item 6).
    expect(utils.getByText("PROCESSING FILM")).toBeTruthy();
    expect(utils.queryByText(/STILL ARRIVES AFTER UPLOAD/)).toBeNull();
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

  it("never says 'No video' while this phone is still uploading (jits-n2im.4 item 1)", async () => {
    act(() => {
      setMatchUpload(mockMatchId, { status: "uploading", progress: 0.3, bytesTotal: 1000 });
    });
    const utils = await renderLoaded(view({ videos: [] }));
    expect(utils.queryByTestId("match-detail-no-video")).toBeNull();
    expect(utils.getByTestId("upload-status-banner")).toBeTruthy();
    expect(utils.getByText("Uploading match video")).toBeTruthy();
  });

  it("shows a paused upload with Retry on the match page (jits-n2im.3)", async () => {
    act(() => {
      setMatchUpload(mockMatchId, { status: "paused", progress: 0.5, error: "Upload paused: no connection.", errorClass: "offline" });
    });
    const utils = await renderLoaded(view({ videos: [] }));
    expect(utils.queryByTestId("match-detail-no-video")).toBeNull();
    expect(utils.getByText("UPLOAD PAUSED · 50%")).toBeTruthy();
    expect(utils.getByTestId("upload-retry")).toBeTruthy();
  });

  it("shows this phone's failed upload beside the opponent's film", async () => {
    act(() => {
      setMatchUpload(mockMatchId, { status: "error", error: "Upload failed.", errorClass: "not_allowed" });
    });
    const utils = await renderLoaded(view({ videos: [video({ uploaded_by: "opp" })] }));
    expect(utils.getByTestId("upload-status-banner")).toBeTruthy();
    expect(utils.queryByTestId("match-detail-no-video")).toBeNull();
  });

  it("re-reads the match the moment this phone's upload lands (jits-n2im.4 item 2)", async () => {
    act(() => {
      setMatchUpload(mockMatchId, { status: "uploading", progress: 0.9 });
    });
    const utils = await renderLoaded(view({ videos: [] }));
    const reads = mockGetMatchDetailView.mock.calls.length;

    mockGetMatchDetailView.mockResolvedValue(view({ videos: [video()] }));
    act(() => {
      setMatchUpload(mockMatchId, { status: "uploaded", videoId: "v-mine", progress: 1 });
    });

    await waitFor(() => expect(mockGetMatchDetailView.mock.calls.length).toBe(reads + 1));
    await waitFor(() => expect(utils.queryByTestId("upload-status-banner")).toBeNull());
    expect(utils.queryByTestId("match-detail-no-video")).toBeNull();
  });

  it("says why the hero cannot play a film that is still processing (jits-n2im.4 item 5)", async () => {
    const utils = await renderLoaded(
      view({ videos: [video({ poster_url: "https://signed/p.jpg", thumbnail_key: "k", playability: "processing", status: "processing" })] }),
    );
    expect(utils.queryByLabelText("Play match film")).toBeNull();
    expect(utils.getByTestId("match-hero-play-hint")).toHaveTextContent("PROCESSING");
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
    expect(utils.getByLabelText("Play from 03:20, Back take")).toBeTruthy();
    expect(utils.queryByLabelText(/^Play from 03:57/)).toBeNull();
    expect(utils.getByText("FINISH")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Play from 00:27, Takedown"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/video/v-mine?t=27");
    expect(within(utils.getByTestId("technique-tags")).getByText("Single leg")).toBeTruthy();
    expect(within(utils.getByTestId("technique-tags")).getByText("RNC")).toBeTruthy();
  });

  describe("no match detected (jr_be-0qf)", () => {
    const NO_MATCH = {
      ok: true,
      data: {
        summary: "The video shows an empty office, not a jiu-jitsu match.",
        analysis_tier: "standard",
        positions: [],
        scoring_moments: [],
        technique_tags: [],
        recommendations: [
          { athlete_id: "me-1", text: "Frame both athletes from mat level." },
          { athlete_id: null, text: "Turn on more light." },
        ],
        completed_at: null,
        match_detected: false,
        no_match_reason: "An empty office; nobody is grappling.",
      },
    };
    const analysed = () => view({ videos: [video({ has_analysis: true, status: "analyzed" })] });

    it("says so plainly with the reason and filming tips, and no summary, tier, moments or tags", async () => {
      mockGetVideoAnalysis.mockResolvedValue(NO_MATCH);
      const utils = await renderLoaded(analysed());
      await waitFor(() => expect(utils.getByTestId("breakdown-no-match")).toBeTruthy());
      expect(utils.getByText("We didn't see a match in this video")).toBeTruthy();
      expect(utils.getByTestId("breakdown-no-match-reason")).toHaveTextContent("An empty office; nobody is grappling.");
      const tips = utils.getByTestId("breakdown-no-match-tips");
      expect(within(tips).getByText("Filming tips")).toBeTruthy();
      expect(within(tips).getByText("Frame both athletes from mat level.")).toBeTruthy();
      expect(within(tips).getByText("Turn on more light.")).toBeTruthy();
      expect(utils.queryByText(NO_MATCH.data.summary)).toBeNull();
      expect(utils.queryByText("STANDARD")).toBeNull();
      expect(utils.queryByTestId("key-moments")).toBeNull();
      expect(utils.queryByTestId("technique-tags")).toBeNull();
      expect(utils.queryByText("FINISH")).toBeNull();
      // Neutral, not an error: no retry offered.
      expect(utils.queryByLabelText("Retry breakdown")).toBeNull();
      // The film itself stays watchable.
      expect(utils.getAllByLabelText(/^Watch/).length).toBeGreaterThan(0);
    });

    it("never shows moments or tags even if a stray one arrives with the no-match verdict", async () => {
      mockGetVideoAnalysis.mockResolvedValue({
        ok: true,
        data: { ...NO_MATCH.data, scoring_moments: ANALYSIS.data.scoring_moments, technique_tags: ANALYSIS.data.technique_tags },
      });
      const utils = await renderLoaded(analysed());
      await waitFor(() => expect(utils.getByTestId("breakdown-no-match")).toBeTruthy());
      expect(utils.queryByTestId("key-moments")).toBeNull();
      expect(utils.queryByTestId("technique-tags")).toBeNull();
    });

    it("falls back to a plain sentence with no reason and hides tips when there are none", async () => {
      mockGetVideoAnalysis.mockResolvedValue({
        ok: true,
        data: { ...NO_MATCH.data, no_match_reason: null, recommendations: [] },
      });
      const utils = await renderLoaded(analysed());
      await waitFor(() => expect(utils.getByTestId("breakdown-no-match")).toBeTruthy());
      expect(utils.getByTestId("breakdown-no-match-reason")).toHaveTextContent(
        "The analysis found no jiu-jitsu in this recording.",
      );
      expect(utils.queryByTestId("breakdown-no-match-tips")).toBeNull();
    });

    it.each([
      ["true", true],
      ["null (legacy / unknown)", null],
    ])("match_detected %s renders the normal breakdown", async (_label, matchDetected) => {
      mockGetVideoAnalysis.mockResolvedValue({
        ok: true,
        data: { ...ANALYSIS.data, recommendations: [], match_detected: matchDetected, no_match_reason: null },
      });
      const utils = await renderLoaded(analysed());
      await waitFor(() => expect(utils.getByText(ANALYSIS.data.summary)).toBeTruthy());
      expect(utils.queryByTestId("breakdown-no-match")).toBeNull();
      expect(utils.getByText("KEY MOMENTS")).toBeTruthy();
      expect(utils.getByTestId("technique-tags")).toBeTruthy();
    });

    it.each(["light", "dark"] as const)("uses the %s theme's ink, never red", async (scheme) => {
      mockScheme = scheme;
      const p = paletteFor(scheme);
      mockGetVideoAnalysis.mockResolvedValue(NO_MATCH);
      const utils = await renderLoaded(analysed());
      await waitFor(() => expect(utils.getByTestId("breakdown-no-match")).toBeTruthy());
      expect(colorOf(utils.getByText("We didn't see a match in this video"))).toBe(p.text);
      expect(colorOf(utils.getByTestId("breakdown-no-match-reason"))).toBe(p.text2);
      const colors = within(utils.getByTestId("breakdown-no-match"))
        .UNSAFE_queryAllByType(require("react-native").Text)
        .map((t: { props: { style?: unknown } }) => colorOf(t));
      expect(colors).not.toContain(p.red);
      expect(colors).not.toContain(p.cta);
    });
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
    // The mark is a passive effect of the ready render: under load it can
    // trail the loading marker's removal, so wait for it.
    await waitFor(() => expect(isMatchSeen(mockMatchId)).toBe(true));
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

  describe("Your highlight", () => {
    function highlight(videoId: string, phase: string) {
      return {
        matchVideoId: videoId,
        athleteId: "me-1",
        enabled: phase !== "disabled",
        phase,
        highlightId: "h-1",
        status: null,
        planStatus: "planning",
        renderTotal: 0,
        renderMax: 10,
        rendersRemaining: 10,
        canRegenerate: false,
        lastAttemptFailed: false,
        playback: null,
        errorMessage: null,
        identityDisputed: false,
        identitySide: null,
        lastChangeSummary: null,
        updatedAt: null,
      };
    }

    it("reads the viewer's own reel for each video of the match", async () => {
      await renderLoaded(view({ videos: [video(), video(OPP_VIDEO)] }));
      const ids = mockUseHighlightProgress.mock.calls.map((c) => c[1]);
      expect(ids).toEqual(expect.arrayContaining(["v-mine", "v-opp"]));
    });

    it("renders no card until progress loads, or when disabled / unavailable", async () => {
      const utils = await renderLoaded(view());
      expect(utils.queryByText("Your highlight")).toBeNull();
      mockHighlightByVideo = { "v-mine": highlight("v-mine", "disabled") };
      const again = await renderLoaded(view());
      expect(again.queryByText("Your highlight")).toBeNull();
      mockHighlightByVideo = { "v-mine": highlight("v-mine", "unavailable") };
      const third = await renderLoaded(view());
      expect(third.queryByText("Your highlight")).toBeNull();
    });

    it("shows the neutral no-match note on the card, with no actions", async () => {
      mockHighlightByVideo = {
        "v-mine": { ...highlight("v-mine", "no_match"), enabled: false, highlightId: null, planStatus: null, matchDetected: false, noMatchReason: "Empty room." },
      };
      const utils = await renderLoaded(view());
      expect(utils.getByTestId("highlight-no-match")).toHaveTextContent(
        "No match was detected in this video, so there's no highlight reel.",
      );
      const card = utils.getByTestId("highlight-card-v-mine");
      expect(within(card).queryAllByRole("button")).toHaveLength(0);
    });

    it("renders the card under the film angles, without a red CTA while generating", async () => {
      mockHighlightByVideo = { "v-mine": highlight("v-mine", "planning") };
      const utils = await renderLoaded(view());
      expect(utils.getByTestId("highlight-card-v-mine")).toBeTruthy();
      expect(utils.getByText("Your highlight")).toBeTruthy();
      expect(utils.getByText("GENERATING")).toBeTruthy();
      const order: string[] = [];
      const walk = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) return node.forEach(walk);
        const n = node as { props?: { testID?: string }; children?: unknown };
        if (n.props?.testID) order.push(n.props.testID);
        walk(n.children);
      };
      walk(utils.toJSON());
      // Under the film (the Watch rows).
      expect(order.indexOf("match-video-watch-v-mine")).toBeGreaterThanOrEqual(0);
      expect(order.indexOf("match-video-watch-v-mine")).toBeLessThan(
        order.indexOf("highlight-card-v-mine"),
      );
      // Watch stays the screen's one Signal Red CTA.
      expect(utils.queryByTestId("highlight-retry")).toBeNull();
    });

    it("labels each card with the recording when the match has two", async () => {
      mockHighlightByVideo = {
        "v-mine": highlight("v-mine", "none"),
        "v-opp": highlight("v-opp", "waiting_for_analysis"),
      };
      const utils = await renderLoaded(view({ videos: [video(), video(OPP_VIDEO)] }));
      expect(within(utils.getByTestId("highlight-card-v-mine")).getByText("Your recording")).toBeTruthy();
      expect(
        within(utils.getByTestId("highlight-card-v-opp")).getByText("Demo Red's recording"),
      ).toBeTruthy();
    });

    it("pull-to-refresh re-reads the match AND the highlight cards", async () => {
      mockHighlightByVideo = { "v-mine": highlight("v-mine", "planning") };
      const utils = await renderLoaded(view());
      const calls = mockGetMatchDetailView.mock.calls.length;
      const scroll = utils.UNSAFE_getByType(require("react-native").ScrollView);
      await act(async () => {
        scroll.props.refreshControl.props.onRefresh();
      });
      expect(mockGetMatchDetailView.mock.calls.length).toBeGreaterThan(calls);
      expect(mockHighlightRefresh).toHaveBeenCalled();
    });
  });
});
