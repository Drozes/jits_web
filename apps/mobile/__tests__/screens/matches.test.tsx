import * as React from "react";
import { act, configure, fireEvent, render, waitFor, within } from "@testing-library/react-native";

// Heavy screen renders: under a loaded machine (parallel agents, the
// pre-commit hook running every workspace at once) the defaults (5 s per
// test, 1 s per waitFor) timed out while the suite passes alone in ~15 s.
// Generous ceilings keep the gate load-insensitive without slowing a pass.
jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 5_000 });

type HostNode = ReturnType<typeof render>["UNSAFE_root"];

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useFocusEffect: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
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
jest.mock("@/components/ui/skeleton", () => {
  const R = require("react");
  const RN = require("react-native");
  const Pass = ({ children }: { children?: React.ReactNode }) => R.createElement(RN.View, null, children);
  return { SkeletonProvider: Pass, SkeletonBlock: () => R.createElement(RN.View) };
});
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
// The shared tab header (Live Chip and bell) is covered by its own suites;
// here it only has to be the one the screen draws, titled Matches.
const mockTabHeader = jest.fn();
jest.mock("@/components/layout/tab-header", () => ({
  TabHeader: (props: { title: string }) => {
    mockTabHeader(props);
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.Text, { testID: "tab-header", accessibilityRole: "header" }, props.title);
  },
}));
const mockToastError = jest.fn();
jest.mock("@/components/ui/toast", () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a), success: jest.fn() } }));
jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "light",
  useThemedTokens: () => ({ accentCta: "#E63946", textSecondary: "#4B5563" }),
}));
jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({
    athlete: { id: mockAthleteId(), display_name: "Kai Reyes", current_elo: 1526, primary_gym_id: null, profile_photo_url: null },
  }),
}));
jest.mock("@/lib/profile/use-profile-data", () => ({
  useProfileData: () => ({
    history: [
      ...Array.from({ length: 15 }, () => ({ athlete_outcome: "win" })),
      ...Array.from({ length: 7 }, () => ({ athlete_outcome: "loss" })),
      ...Array.from({ length: 2 }, () => ({ athlete_outcome: "draw" })),
    ],
  }),
}));
jest.mock("@/lib/highlight/use-highlight-flags", () => ({ useHighlightFlags: () => ({ clipsEnabled: mockClips(), shareEnabled: false }) }));
let mockClipsOn = true;
function mockClips() {
  return mockClipsOn;
}
const mockFlagState = jest.fn();
jest.mock("@/lib/invites/use-invites-enabled", () => ({ useInvitesFlagState: () => mockFlagState() }));
jest.mock("@/lib/match-flow/use-my-active-match", () => ({ useMyActiveMatch: () => ({ match: null, refresh: jest.fn() }) }));
jest.mock("@/lib/practice/use-has-ever-played", () => ({ useHasEverPlayed: () => false }));
const mockCapture = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({ captureMessage: (...a: unknown[]) => mockCapture(...a), addBreadcrumb: jest.fn() }));
// The feed mounts a small window (4 rows) and grows it on layout and scroll,
// which never happen in a test renderer: mount every row here.
jest.mock("@/lib/matches/feed-list-tuning", () => ({ FEED_LIST_TUNING: { initialNumToRender: 100, windowSize: 21, removeClippedSubviews: false } }));
const mockGetMyMatchLibrary = jest.fn();
jest.mock("@jits/shared/api/film-room", () => ({
  getMyMatchLibrary: (...a: unknown[]) => mockGetMyMatchLibrary(...a),
}));

// The library's first page is cached per athlete: a fresh athlete per test.
let mockSeq = 0;
function mockAthleteId() {
  return `film-ath-${mockSeq}`;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import MatchesScreen from "@/app/(app)/(tabs)/matches/index";
import { __resetSeenMatches, isMatchSeen, loadSeenMatches, markMatchSeen } from "@/lib/film-room/seen-store";
import { resetMatchUploadStore, setMatchUpload } from "@/lib/video/match-upload-store";
import { libItem, libVideo } from "../support/film-fixtures";

const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function page(items: ReturnType<typeof libItem>[], next: string | null = null) {
  return { ok: true, data: { items, next_before: next, next_before_id: next ? "id-" + next : null, source: "rpc" } };
}

const PARK = { id: "opp-1", display_name: "Mina Park", profile_photo_url: null };
const SILVA = { id: "opp-2", display_name: "Joao Silva", profile_photo_url: null };

function library() {
  return [
    libItem({ match_id: "m-new", completed_at: daysAgo(0), opponent: PARK }),
    libItem({ match_id: "m-analyzing", completed_at: daysAgo(0), outcome: "loss", elo_delta: -11, opponent: SILVA, videos: [libVideo({ status: "analyzing", has_analysis: false, chunk_count: 7, chunks_completed: 3 })] }),
    libItem({ match_id: "m-ready", completed_at: daysAgo(0), outcome: "draw", elo_delta: 1, opponent: PARK, videos: [libVideo(), libVideo({ video_id: "v-2", uploaded_by: "opp-1" })] }),
    libItem({ match_id: "m-failed", completed_at: daysAgo(0), opponent: SILVA, videos: [libVideo({ status: "failed", playability: "failed", has_analysis: false, poster_url: null })] }),
    libItem({ match_id: "m-up", completed_at: daysAgo(0), opponent: PARK, videos: [] }),
  ];
}

/**
 * Mounts the screen and waits for the first page deterministically: the
 * mocked read's promise is awaited inside act(), so React commits the loaded
 * list before the function returns, whatever the machine load. (The old
 * waitFor-only version timed out about 1 in 10 full runs, jits-rvgx.) The
 * waitFor after it is a backstop with a wide ceiling, inside the 30 s
 * per-test budget set at the top of this file.
 */
async function renderLoaded(result: unknown = page(library())) {
  mockGetMyMatchLibrary.mockResolvedValue(result);
  const utils = render(<MatchesScreen />);
  await act(async () => {
    await Promise.all(mockGetMyMatchLibrary.mock.results.map((r) => r.value));
  });
  await waitFor(() => expect(utils.queryByTestId("matches-loading")).toBeNull(), { timeout: 15_000 });
  return utils;
}

function badgeOf(utils: ReturnType<typeof render>, matchId: string): string | null {
  const card = utils.getByTestId(`match-feed-card-${matchId}`);
  const badge = within(card).queryByTestId("film-card-badge");
  if (!badge) return null;
  const text = within(badge).UNSAFE_getByType(require("react-native").Text);
  return text.props.children as string;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockSeq += 1;
  mockClipsOn = true;
  mockFlagState.mockReturnValue({ enabled: true, known: true, state: "on" });
  __resetSeenMatches();
  resetMatchUploadStore();
  await AsyncStorage.clear();
  // Read the (empty) seen set up front so its async load never lands mid-test.
  await loadSeenMatches();
});

describe("MatchesScreen (the Matches tab, spec specs/matches-tab/spec.md section 6)", () => {
  it("shows the Matches tab header, the record strip and a skeleton while the first page loads", () => {
    mockGetMyMatchLibrary.mockReturnValue(new Promise(() => undefined));
    const utils = render(<MatchesScreen />);
    expect(mockTabHeader).toHaveBeenLastCalledWith({ title: "Matches" });
    expect(utils.getByTestId("tab-header")).toHaveTextContent("Matches");
    expect(utils.getByTestId("matches-record")).toHaveTextContent("24 MATCHES · 15W 7L 2D · 1526");
    expect(utils.getByTestId("matches-loading")).toBeTruthy();
    // The feed skeleton is three full-width cards (spec 6.4, AC 2.12).
    expect(utils.getAllByTestId("matches-skeleton-card")).toHaveLength(3);
    // A tab root: no back button, and no Film Room title any more.
    expect(utils.queryByLabelText("Go back")).toBeNull();
    expect(utils.queryByText("FILM ROOM")).toBeNull();
    // The carousel slot stays empty until the carousel lands (jits-a4fw.4).
    expect(utils.queryByTestId("matches-carousel-slot")).toBeNull();
  });

  it("lists full-width feed cards under a month heading; the meta row opens the match page and clears NEW", async () => {
    const utils = await renderLoaded();
    const month = NOW.toLocaleString("en-US", { month: "long" }).toUpperCase();
    expect(utils.getByText(`${month} ${NOW.getFullYear()}`)).toBeTruthy();
    expect(utils.getByText("5 MATCHES")).toBeTruthy();
    const meta = utils.getByTestId("film-card-m-new");
    expect(meta.props.accessibilityLabel).toMatch(/^Open match vs M\. Park, new\. Won, plus 14, [A-Z][a-z]{2} \d{1,2}$/);
    expect(isMatchSeen("m-new")).toBe(false);
    fireEvent.press(meta);
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/m-new");
    expect(isMatchSeen("m-new")).toBe(true);
    await waitFor(() => expect(badgeOf(utils, "m-new")).not.toBe("NEW"));
  });

  it("a playable card's media plays the selected video and clears NEW; one with nothing playable opens the match", async () => {
    const utils = await renderLoaded();
    fireEvent.press(utils.getByTestId("film-card-media-m-new"));
    expect(mockPush).toHaveBeenLastCalledWith("/(app)/video/v-1");
    expect(isMatchSeen("m-new")).toBe(true);
    fireEvent.press(utils.getByTestId("film-card-media-m-failed"));
    expect(mockPush).toHaveBeenLastCalledWith("/(app)/match-detail/m-failed");
  });

  it("shows one badge per card: NEW, ANALYZING n/m, BREAKDOWN READY, FAILED, UPLOADING %", async () => {
    markMatchSeen("m-ready");
    act(() => {
      setMatchUpload("m-up", { status: "uploading", progress: 0.64 });
    });
    const utils = await renderLoaded();
    await waitFor(() => expect(badgeOf(utils, "m-new")).toBe("NEW"));
    expect(badgeOf(utils, "m-analyzing")).toBe("ANALYZING 3/7");
    expect(badgeOf(utils, "m-ready")).toBe("BREAKDOWN READY");
    expect(badgeOf(utils, "m-failed")).toBe("FAILED");
    // One badge only: the angle count is not a second badge on the feed card.
    expect(within(utils.getByTestId("match-feed-card-m-ready")).getAllByTestId("film-card-badge")).toHaveLength(1);
    expect(within(utils.getByTestId("match-feed-card-m-ready")).queryByText("2 ANGLES")).toBeNull();
    expect(badgeOf(utils, "m-up")).toBe("UPLOADING 64%");
    expect(within(utils.getByTestId("match-feed-card-m-up")).getByTestId("film-card-progress").props.style).toMatchObject({ width: "64%" });

    act(() => {
      setMatchUpload("m-up", { progress: 0.9 });
    });
    expect(badgeOf(utils, "m-up")).toBe("UPLOADING 90%");
  });

  it("re-renders only the uploading poster on a progress tick", async () => {
    act(() => {
      setMatchUpload("m-up", { status: "uploading", progress: 0.1 });
    });
    const utils = await renderLoaded();
    await waitFor(() => expect(badgeOf(utils, "m-up")).toBe("UPLOADING 10%"));
    const cardStatus = require("@/lib/film-room/card-status");
    const spy = jest.spyOn(cardStatus, "deriveCardStatus");
    act(() => {
      setMatchUpload("m-up", { progress: 0.5 });
    });
    expect(badgeOf(utils, "m-up")).toBe("UPLOADING 50%");
    expect(spy.mock.calls.map((c) => (c[0] as { match_id: string }).match_id)).toEqual(["m-up"]);
    spy.mockClear();
    act(() => {
      setMatchUpload("some-other-match", { status: "uploading", progress: 0.5 });
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("marks a disputed match in its meta row", async () => {
    const utils = await renderLoaded(page([libItem({ match_id: "m-d", status: "disputed" })]));
    expect(within(utils.getByTestId("film-card-m-d")).getByText("DISPUTED")).toBeTruthy();
  });

  it("uses the signed still when there is one and the two-athlete fallback otherwise", async () => {
    const utils = await renderLoaded();
    const still = within(utils.getByTestId("match-feed-card-m-new")).getByTestId("feed-poster");
    expect(still.props.source).toEqual({ uri: "https://signed/k.jpg", cacheKey: "film-still-k.jpg" });
    const failed = utils.getByTestId("match-feed-card-m-failed");
    expect(within(failed).getByTestId("opening-still-fallback")).toBeTruthy();
    expect(within(failed).getByText("FILM FAILED TO PROCESS")).toBeTruthy();
    // No video rows at all: C-L7, and the first such card teaches C-L6 (the carousel slot is empty).
    const noFilm = utils.getByTestId("match-feed-card-m-up");
    expect(within(noFilm).getByText("NO FILM FOR THIS ONE")).toBeTruthy();
    expect(within(noFilm).getByTestId("film-card-helper")).toHaveTextContent("Turn on Record from my phone at face-off.");
  });

  it("a zero-video card still uploading on this phone is skipped: the helper moves to the next C-L7 card", async () => {
    act(() => {
      setMatchUpload("nf-1", { status: "uploading", progress: 0.2 });
    });
    const utils = await renderLoaded(
      page([
        libItem({ match_id: "nf-1", completed_at: daysAgo(1), videos: [] }),
        libItem({ match_id: "nf-2", completed_at: daysAgo(2), videos: [] }),
        libItem({ match_id: "nf-3", completed_at: daysAgo(3), videos: [] }),
        libItem({ match_id: "nf-4", completed_at: daysAgo(4), videos: [] }),
      ]),
    );
    expect(within(utils.getByTestId("match-feed-card-nf-2")).getByTestId("film-card-helper")).toBeTruthy();
    expect(utils.getAllByTestId("film-card-helper")).toHaveLength(1);
    // The upload fails over to paused: still not C-L7. Cleared: nf-1 takes the helper back.
    act(() => {
      setMatchUpload("nf-1", { status: "paused" });
    });
    expect(within(utils.getByTestId("match-feed-card-nf-2")).getByTestId("film-card-helper")).toBeTruthy();
  });

  it("teaches the recording helper on the first no-film card only (AC 6.7)", async () => {
    const utils = await renderLoaded(
      page([
        libItem({ match_id: "f", completed_at: daysAgo(0) }),
        libItem({ match_id: "nf-1", completed_at: daysAgo(1), videos: [] }),
        libItem({ match_id: "nf-2", completed_at: daysAgo(2), videos: [] }),
        libItem({ match_id: "nf-3", completed_at: daysAgo(3), videos: [] }),
        libItem({ match_id: "nf-4", completed_at: daysAgo(4), videos: [] }),
      ]),
    );
    expect(utils.getAllByTestId("film-card-helper")).toHaveLength(1);
    expect(within(utils.getByTestId("match-feed-card-nf-1")).getByTestId("film-card-helper")).toBeTruthy();
    expect(utils.getAllByText("NO FILM FOR THIS ONE")).toHaveLength(4);
  });

  it("filters by result", async () => {
    const utils = await renderLoaded();
    fireEvent.press(utils.getByTestId("film-filter-loss"));
    expect(utils.getByTestId("film-card-m-analyzing")).toBeTruthy();
    expect(utils.queryByTestId("film-card-m-new")).toBeNull();
    expect(utils.getByTestId("film-filter-loss").props.accessibilityState).toMatchObject({ selected: true });

    fireEvent.press(utils.getByTestId("film-filter-draw"));
    expect(utils.getByTestId("film-card-m-ready")).toBeTruthy();
    expect(utils.queryByTestId("film-card-m-analyzing")).toBeNull();

    fireEvent.press(utils.getByTestId("film-filter-all"));
    expect(utils.getByTestId("film-card-m-new")).toBeTruthy();
  });

  it("filters by opponent through the picker", async () => {
    const utils = await renderLoaded();
    fireEvent.press(utils.getByTestId("film-filter-opponent"));
    expect(utils.getByTestId("film-opponent-sheet")).toBeTruthy();
    fireEvent.press(utils.getByTestId("film-opponent-opp-2"));
    expect(utils.getByTestId("film-card-m-analyzing")).toBeTruthy();
    expect(utils.getByTestId("film-card-m-failed")).toBeTruthy();
    expect(utils.queryByTestId("film-card-m-new")).toBeNull();
    expect(utils.getByText("vs J. Silva ▾")).toBeTruthy();

    fireEvent.press(utils.getByTestId("film-filter-opponent"));
    fireEvent.press(utils.getByTestId("film-opponent-any"));
    expect(utils.getByTestId("film-card-m-new")).toBeTruthy();
  });

  it("exposes the result chips as selectable tabs with 44 pt targets", async () => {
    const utils = await renderLoaded();
    const wins = utils.getByTestId("film-filter-win");
    expect(wins.props.accessibilityRole).toBe("tab");
    expect(utils.getByTestId("film-filter-all").props.accessibilityState).toMatchObject({ selected: true });
    const flat = Object.assign({}, ...[].concat(wins.props.style));
    expect(flat.height + wins.props.hitSlop.top + wins.props.hitSlop.bottom).toBeGreaterThanOrEqual(44);
    expect(utils.getByTestId("film-filter-opponent").props.accessibilityRole).toBe("button");
  });

  it("offers to clear a filter with no matches", async () => {
    const utils = await renderLoaded(page([libItem({ match_id: "only-win" })]));
    fireEvent.press(utils.getByTestId("film-filter-loss"));
    expect(utils.getByTestId("film-room-empty-filtered")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Show all"));
    expect(utils.getByTestId("film-card-only-win")).toBeTruthy();
  });

  it("pages through next_before when the list end is reached", async () => {
    mockGetMyMatchLibrary
      .mockResolvedValueOnce(page([libItem({ match_id: "p1", completed_at: daysAgo(1) })], "cursor-1"))
      .mockResolvedValueOnce(page([libItem({ match_id: "p2", completed_at: daysAgo(40) })], null));
    const utils = render(<MatchesScreen />);
    await waitFor(() => expect(utils.getByTestId("film-card-p1")).toBeTruthy());
    const list = utils.UNSAFE_root.find((n: HostNode) => typeof n.props.onEndReached === "function");
    await act(async () => {
      list.props.onEndReached();
    });
    await waitFor(() => expect(utils.getByTestId("film-card-p2")).toBeTruthy());
    expect(mockGetMyMatchLibrary).toHaveBeenLastCalledWith({}, mockAthleteId(), { limit: 20, before: "cursor-1", beforeId: "id-cursor-1" });
  });

  it("omits the count on the oldest loaded month while more pages exist", async () => {
    const utils = await renderLoaded(page([libItem({ match_id: "p1", completed_at: daysAgo(0) })], "cursor-1"));
    expect(utils.getByTestId("film-card-p1")).toBeTruthy();
    expect(utils.queryByText("1 MATCH")).toBeNull();
    const done = await renderLoaded(page([libItem({ match_id: "p2", completed_at: daysAgo(0) })]));
    expect(done.getByText("1 MATCH")).toBeTruthy();
  });

  it("zero matches: the first match hero replaces the feed, with no record strip or chips (AC 6.1)", async () => {
    const utils = await renderLoaded(page([]));
    expect(utils.getByTestId("matches-zero")).toBeTruthy();
    expect(utils.queryByTestId("film-room-empty")).toBeNull();
    expect(utils.queryByTestId("matches-record")).toBeNull();
    expect(utils.queryByTestId("film-filter-all")).toBeNull();
    expect(utils.getByText("Your first match will show up here")).toBeTruthy();
    fireEvent.press(utils.getByTestId("matches-zero-arena"));
    expect(mockPush).toHaveBeenCalledWith("/arena");
    expect(mockCapture).toHaveBeenCalledWith("matches.empty_cta", { level: "info", tags: { surface: "matches", state: "zero", cta: "arena" } });
    fireEvent.press(utils.getByTestId("matches-zero-invite"));
    expect(mockPush).toHaveBeenCalledWith("/invite?from=matches");
    expect(mockCapture).toHaveBeenCalledWith("matches.empty_cta", { level: "info", tags: { surface: "matches", state: "zero", cta: "invite" } });
  });

  it("zero matches with clips off uses the film copy (AC 6.11)", async () => {
    mockClipsOn = false;
    const utils = await renderLoaded(page([]));
    expect(utils.getByText("Your first match lands here")).toBeTruthy();
    expect(utils.queryByTestId("matches-zero-progress")).toBeNull();
  });

  it("zero matches while the invites flag is unknown: no secondary action yet (AC 6.2)", async () => {
    mockFlagState.mockReturnValue({ enabled: false, known: false, state: "unknown" });
    const utils = await renderLoaded(page([]));
    expect(utils.queryByTestId("matches-zero-invite")).toBeNull();
    expect(utils.queryByTestId("matches-zero-practice")).toBeNull();
    expect(utils.getByTestId("matches-zero-secondary")).toBeTruthy();
  });

  it("low data: a next match ghost card follows the last card, and the first match and first win are tagged (AC 6.4, 6.5)", async () => {
    const utils = await renderLoaded(
      page([
        libItem({ match_id: "c", completed_at: daysAgo(0), outcome: "win" }),
        libItem({ match_id: "b", completed_at: daysAgo(2), outcome: "win" }),
        libItem({ match_id: "a", completed_at: daysAgo(4), outcome: "loss", elo_delta: -9 }),
      ]),
    );
    expect(utils.getByTestId("matches-next-ghost")).toBeTruthy();
    expect(utils.getByText("Your next match goes here")).toBeTruthy();
    expect(within(utils.getByTestId("film-card-a")).getByText("FIRST MATCH")).toBeTruthy();
    expect(within(utils.getByTestId("film-card-b")).getByText("FIRST WIN")).toBeTruthy();
    expect(within(utils.getByTestId("film-card-c")).queryByText("FIRST WIN")).toBeNull();
    fireEvent.press(utils.getByTestId("matches-next-ghost-arena"));
    expect(mockPush).toHaveBeenCalledWith("/arena");
    expect(mockCapture).toHaveBeenCalledWith("matches.empty_cta", { level: "info", tags: { surface: "matches", state: "low_data", cta: "arena" } });
    // A filter hides the ghost (it sells the next match, not a filtered view).
    fireEvent.press(utils.getByTestId("film-filter-win"));
    expect(utils.queryByTestId("matches-next-ghost")).toBeNull();
  });

  it("no next match ghost and no FIRST tags while more pages exist", async () => {
    const utils = await renderLoaded(page([libItem({ match_id: "p1", completed_at: daysAgo(0) })], "cursor-1"));
    expect(utils.queryByTestId("matches-next-ghost")).toBeNull();
    expect(utils.queryByText("FIRST MATCH")).toBeNull();
  });

  it("keeps the cached list and toasts when a refresh fails (C-E2)", async () => {
    const utils = await renderLoaded();
    mockGetMyMatchLibrary.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const list = utils.UNSAFE_root.findAll((n: HostNode) => n.props.refreshControl != null)[0];
    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Couldn't refresh your matches"));
    expect(utils.getByTestId("film-card-m-new")).toBeTruthy();
    expect(utils.queryByTestId("film-room-error")).toBeNull();
  });

  it("a background revalidate (an upload settling) keeps the spinner off and never toasts, even when it fails", async () => {
    act(() => {
      setMatchUpload("m-new", { status: "uploading", progress: 0.5 });
    });
    const utils = await renderLoaded();
    let fail: (v: unknown) => void = () => undefined;
    mockGetMyMatchLibrary.mockReturnValue(new Promise((r) => (fail = r)));
    const calls = mockGetMyMatchLibrary.mock.calls.length;
    act(() => {
      setMatchUpload("m-new", { status: "uploaded", videoId: "v-9", progress: 1 });
    });
    await waitFor(() => expect(mockGetMyMatchLibrary.mock.calls.length).toBeGreaterThan(calls));
    const control = () => utils.UNSAFE_root.findAll((n: HostNode) => n.props.refreshControl != null)[0].props.refreshControl;
    expect(control().props.refreshing).toBe(false);
    await act(async () => {
      fail({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    });
    expect(control().props.refreshing).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
    expect(utils.getByTestId("film-card-m-new")).toBeTruthy();
  });

  it("pull to refresh re-reads the first page", async () => {
    const utils = await renderLoaded();
    const calls = mockGetMyMatchLibrary.mock.calls.length;
    const list = utils.UNSAFE_root.findAll((n: HostNode) => n.props.refreshControl != null)[0];
    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(mockGetMyMatchLibrary.mock.calls.length).toBeGreaterThan(calls));
    expect(mockGetMyMatchLibrary).toHaveBeenLastCalledWith({}, mockAthleteId(), { limit: 20 });
  });

  it("offers a whole-row retry when loading more fails, and the retry loads the page", async () => {
    mockGetMyMatchLibrary
      .mockResolvedValueOnce(page([libItem({ match_id: "p1", completed_at: daysAgo(1) })], "cursor-1"))
      .mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "offline" } })
      .mockResolvedValueOnce(page([libItem({ match_id: "p2", completed_at: daysAgo(40) })], null));
    const utils = render(<MatchesScreen />);
    await waitFor(() => expect(utils.getByTestId("film-card-p1")).toBeTruthy());
    const list = utils.UNSAFE_root.find((n: HostNode) => typeof n.props.onEndReached === "function");
    await act(async () => {
      list.props.onEndReached();
    });
    const retry = await waitFor(() => utils.getByTestId("film-room-more-retry"));
    expect(retry).toHaveTextContent("COULDN'T LOAD MORE. TAP TO RETRY");
    await act(async () => {
      fireEvent.press(retry);
    });
    await waitFor(() => expect(utils.getByTestId("film-card-p2")).toBeTruthy());
    expect(utils.queryByTestId("film-room-more-retry")).toBeNull();
  });

  it("shows a retryable error when the first page fails", async () => {
    const utils = await renderLoaded({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    expect(utils.getByTestId("film-room-error")).toBeTruthy();
    // A cold load failure is the panel, never the C-E2 toast.
    expect(mockToastError).not.toHaveBeenCalled();
    mockGetMyMatchLibrary.mockResolvedValue(page(library()));
    await act(async () => {
      fireEvent.press(utils.getByLabelText("Try again"));
    });
    await waitFor(() => expect(utils.getByTestId("film-card-m-new")).toBeTruthy());
  });

  it("never uses an em dash in its copy", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const root = path.join(__dirname, "../..");
    const files = [
      "app/(app)/film-room.tsx",
      "app/(app)/(tabs)/matches/index.tsx",
      "app/(app)/(tabs)/matches/_layout.tsx",
      ...(fs.readdirSync(path.join(root, "components/matches")) as string[])
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => `components/matches/${f}`),
      "app/(app)/video/[id].tsx",
      "app/(app)/match-detail/[matchId].tsx",
      // Recursive: the multi-angle player's components live in a subfolder.
      ...(fs.readdirSync(path.join(root, "components/film-room"), { recursive: true }) as string[])
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => `components/film-room/${f}`),
      "components/match-detail/ai-breakdown.tsx",
      "components/match-detail/key-moments.tsx",
      "components/match-detail/film-angles.tsx",
      "components/match-detail/match-hero.tsx",
      "components/match-detail/match-verdict.tsx",
    ];
    for (const f of files) {
      expect(fs.readFileSync(path.join(root, f), "utf8")).not.toContain("—");
    }
  });
});
