import * as React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

// ---- mocks ----

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();

// useFocusEffect runs its callback on mount (the first focus) and records it
// so a test can simulate the tab regaining focus.
const mockFocusCallbacks: (() => void)[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, navigate: mockNavigate }),
  // The swipe viewer's entry (`openReelViewer`) pushes through the global router.
  router: { push: (...a: unknown[]) => mockPush(...a) },
  useFocusEffect: (cb: () => void) => {
    const R = require("react");
    R.useEffect(() => {
      mockFocusCallbacks.push(cb);
      cb();
    }, [cb]);
  },
}));

// Focus refetches are throttled to one per 30s, so step the clock past it.
let mockNow = 1_000_000;
function refocus() {
  mockNow += 31_000;
  act(() => {
    mockFocusCallbacks.forEach((cb) => cb());
  });
}

// Stub all lucide icons
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    {
      get: (_target: Record<string, unknown>, prop: string) => {
        if (prop === "__esModule") return true;
        return stub;
      },
    },
  );
});

// Stub safe area: new dashboard reads insets directly via useSafeAreaInsets
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Theme tokens — include the ELO keys the new dashboard reads
jest.mock("@/lib/theme/use-theme", () => ({
  // The milestone banner and burst read the palette.
  useResolvedColorScheme: () => "dark",
  useThemedTokens: () => ({
    primary: "#ff0000",
    foreground: "#000000",
    accentCta: "#E63946",
    textOnAccent: "#E8EDF2",
  }),
}));

// Supabase client
jest.mock("@/lib/supabase/client", () => ({
  supabase: {},
}));

// Any-match-ever read behind the practice offer (owner, 2026-10-01).
let mockHasEverPlayed: boolean | null = false;
jest.mock("@/lib/practice/use-has-ever-played", () => ({
  useHasEverPlayed: () => mockHasEverPlayed,
}));

// Toast
jest.mock("@/components/ui/toast", () => ({
  toast: { error: jest.fn(), info: jest.fn() },
}));

// Mock heavy child components to isolate the screen
jest.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.View, { testID: "notification-bell" });
  },
}));

// Renders the section title plus one pressable per "Me" row, so the screen's
// onPressMatch wiring is exercised without the real section.
jest.mock("@/components/dashboard/recent-activity-section", () => ({
  RecentActivitySection: ({
    myMatches,
    onPressMatch,
  }: {
    myMatches: { id: string; opponentName: string }[];
    onPressMatch?: (id: string) => void;
  }) => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(
      RN.View,
      {},
      R.createElement(RN.Text, {}, "RecentActivitySection"),
      ...myMatches.map((m) =>
        R.createElement(RN.Pressable, {
          key: m.id,
          accessibilityLabel: `row ${m.id}`,
          onPress: () => onPressMatch?.(m.id),
        }),
      ),
    );
  },
}));

// The active athlete. `primary_gym_id` is overwritten per test to prove Home
// behaves the same for a gym member and a free agent now that it has no gym or
// session surface.
const mockAthlete: {
  id: string;
  display_name: string;
  current_elo: number;
  highest_elo: number;
  status: string;
  profile_photo_url: string | null;
  primary_gym_id: string | null;
  is_bot: boolean;
  practice_match_offered_at: string | null;
  practice_match_completed_at: string | null;
} = {
  id: "a1",
  display_name: "TestUser",
  current_elo: 1200,
  highest_elo: 1250,
  status: "active",
  profile_photo_url: null,
  primary_gym_id: null,
  is_bot: false,
  practice_match_offered_at: null,
  practice_match_completed_at: null,
};

const mockRefreshSoft = jest.fn(async () => undefined);

jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({
    user: { id: "u1" },
    athlete: mockAthlete,
    isLoading: false,
  }),
  // The practice card's refresh, and the header rating's athlete.
  useAuth: () => ({ refreshAthleteSoft: mockRefreshSoft, athlete: mockAthlete }),
}));

jest.mock("@jits/shared/api/mutations", () => ({
  markPracticeMatch: jest.fn(async () => ({ ok: true, data: {} })),
}));

jest.mock("@/lib/auth/auth-context", () => {
  const { createContext } = require("react");
  return { AuthContext: createContext(null) };
});

// Dashboard data query mocks
const mockSummary = {
  stats: { wins: 5, losses: 2, draws: 1, win_streak: 3, best_win_streak: 4 },
  rank: { current: 7, best: 3 },
  recent_matches: [],
  recent_activity: [],
};

// Mobile dropped gym sessions (jits-gewv). The session and gym reads Home used
// to make are still exported by @jits/shared (web uses them), so they are
// mocked here purely so the tests can assert Home never calls them again.
jest.mock("@jits/shared/api/queries", () => ({
  getDashboardSummary: jest.fn().mockResolvedValue(mockSummary),
  getActiveSession: jest.fn().mockResolvedValue(null),
  getGymDetail: jest.fn().mockResolvedValue(null),
  getGymsWithSessions: jest.fn().mockResolvedValue([]),
  getGymDetailResult: jest.fn().mockResolvedValue({ ok: true, data: null }),
  getGymsWithSessionsResult: jest.fn().mockResolvedValue({ ok: true, data: [] }),
  getMyActiveMatch: jest.fn().mockResolvedValue({ ok: true, data: null }),
  signPosterKey: jest.fn().mockResolvedValue("https://signed/poster.jpg"),
}));

jest.mock("@jits/shared/types/composites", () => ({}), { virtual: true });

// Home's invite fallback card reads `invites_enabled`: off (fail-closed, as an
// unmocked read here resolves) unless a test turns it on.
let mockInvitesOn = false;
jest.mock("@/lib/invites/use-invites-enabled", () => ({
  ...jest.requireActual("@/lib/invites/use-invites-enabled"),
  useInvitesEnabled: () => mockInvitesOn,
}));

// The match this athlete timekeeps (timekeeper mode A20): none unless a test says so.
const mockGetMyTimekeepingMatch = jest.fn((..._a: unknown[]) => Promise.resolve({ ok: true, data: null as unknown }));
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  getMyTimekeepingMatch: (...a: unknown[]) => mockGetMyTimekeepingMatch(...a),
}));

// The Highlights carousel's source (specs/matches-tab 7, via useReelLane), and
// cold-start push routing armed by Home.
const mockGetMyHighlights = jest.fn();
const mockSignPosters = jest.fn();
jest.mock("@jits/shared/api/poster-signing", () => ({
  signPosterKeys: (...a: unknown[]) => mockSignPosters(...a),
}));
const mockMarkSeen = jest.fn();
const mockLogEvent = jest.fn();
jest.mock("@jits/shared/api/highlight-share", () => ({
  getMyHighlights: (...a: unknown[]) => mockGetMyHighlights(...a),
  markHighlightSeen: (...a: unknown[]) => mockMarkSeen(...a),
  logHighlightShareEvent: (...a: unknown[]) => mockLogEvent(...a),
}));
const mockRouterReady = jest.fn();
const mockCapture = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({
  captureMessage: (...a: unknown[]) => mockCapture(...a),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));
jest.mock("@/lib/notifications/handlers", () => ({
  markNotificationRouterReady: () => mockRouterReady(),
}));
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});

import DashboardScreen from "@/app/(app)/(tabs)/(home)/index";
import { duration } from "@/lib/motion";
import { __setHighlightReadThrottleForTests, resetHighlightStore } from "@/lib/highlight/highlight-store";
import { __resetSessionPulses } from "@/lib/highlight/reel-lane";

/** A get_my_highlights page as the shared wrapper returns it. */
function highlightsPage(items: unknown[], over: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: {
      clipsEnabled: true,
      shareEnabled: true,
      items,
      nextBefore: null,
      nextBeforeId: null,
      inFlight: [],
      inFlightSupported: true,
      ...over,
    },
  };
}

// The summary has landed: the Recent Activity section replaces its skeleton.
const LOADED = "RecentActivitySection";

/** The (only) red CTA buttons on screen: one Signal Red per surface. */
function redCtas(utils: { root: { findAll: (p: (n: never) => boolean) => unknown[] } }) {
  return utils.root.findAll(
    (n: { type: unknown; props: Record<string, unknown> }) =>
      typeof n.type === "string" &&
      n.props.accessibilityRole === "button" &&
      typeof n.props.className === "string" &&
      /(^|\s)bg-cta(\s|$)/.test(n.props.className as string),
  );
}

interface QueryMocks {
  getDashboardSummary: jest.Mock;
  getActiveSession: jest.Mock;
  getGymDetail: jest.Mock;
  getGymsWithSessions: jest.Mock;
  getGymDetailResult: jest.Mock;
  getGymsWithSessionsResult: jest.Mock;
  getMyActiveMatch: jest.Mock;
}

// useCachedResource's store is a module-level Map that jest never clears
// between tests, and its key is derived from the athlete. A fixed id would hand
// each test the previous one's payload as a warm first paint, so tests would
// start green before their own mocks resolved. A fresh id per test gives each
// one a cold cache.
let athleteSeq = 0;

beforeEach(() => {
  resetHighlightStore();
  __setHighlightReadThrottleForTests(0);
  __resetSessionPulses();
  // Home's Resume card reads the app-wide open-match store (F10); a match
  // left there by the previous test must not show on this one's first frame.
  (
    require("@/lib/match-flow/active-match-store") as {
      __resetActiveMatchStoreForTests: () => void;
    }
  ).__resetActiveMatchStoreForTests();
  jest.clearAllMocks();
  // Re-wire the resolved value each test since clearAllMocks resets mockResolvedValue
  const queries = require("@jits/shared/api/queries") as QueryMocks;
  queries.getDashboardSummary.mockResolvedValue(mockSummary);
  queries.getActiveSession.mockResolvedValue(null);
  queries.getGymDetail.mockResolvedValue(null);
  queries.getGymsWithSessions.mockResolvedValue([]);
  queries.getGymDetailResult.mockResolvedValue({ ok: true, data: null });
  queries.getGymsWithSessionsResult.mockResolvedValue({ ok: true, data: [] });
  queries.getMyActiveMatch.mockResolvedValue({ ok: true, data: null });
  mockGetMyHighlights.mockResolvedValue(highlightsPage([]));
  mockSignPosters.mockImplementation(async (_c: unknown, keys: string[]) => keys.map((k) => `https://signed/${k}`));
  mockMarkSeen.mockResolvedValue({ ok: true, data: null });
  mockLogEvent.mockResolvedValue(undefined);
  mockAthlete.primary_gym_id = null;
  mockAthlete.is_bot = false;
  mockAthlete.practice_match_offered_at = null;
  mockAthlete.practice_match_completed_at = null;
  mockAthlete.id = `a${++athleteSeq}`;
  mockFocusCallbacks.length = 0;
  jest.spyOn(Date, "now").mockImplementation(() => mockNow);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Let Home's open-match read (the app-wide store, F10) land inside act. A
 * test that asserts synchronously otherwise ends with that store write still
 * pending, and it wakes the screen outside act.
 */
async function settleActiveMatchRead() {
  await act(async () => {});
}

describe("DashboardScreen", () => {
  // jits-1ez5.3: the rating moved to the header (wordmark + rating on every
  // tab root); the greeting, the display name and the EloTile hero are gone.
  it("draws no greeting, no display name and no EloTile", async () => {
    const { findByText, queryByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await findByText(LOADED);
    expect(queryByText("Welcome back")).toBeNull();
    expect(queryByText("Welcome")).toBeNull();
    expect(queryByText("TestUser")).toBeNull();
    expect(queryByTestId("elo-tile-meta")).toBeNull();
    expect(queryByTestId("elo-tile-meta-placeholder", { includeHiddenElements: true })).toBeNull();
    expect(queryByText("5W · 2L · 1D")).toBeNull();
  });

  it("shows the rating once, in the header, from the athlete", async () => {
    const { findByText, getByTestId, getAllByText } = render(React.createElement(DashboardScreen));
    await findByText(LOADED);
    expect(getByTestId("header-elo")).toHaveProp("accessibilityLabel", "Your rating 1200");
    expect(getAllByText("1200")).toHaveLength(1);
    expect(getByTestId("tab-header-title-home")).toBeTruthy();
  });

  // P-Home: no "Current ELO Rating" label and no Arena nudge card (the Arena
  // tab covers it), for a gym member and a free agent alike.
  it.each([
    ["a free agent", null],
    ["a gym member", "g1"],
  ])("shows %s no Elo label and no Arena nudge card", async (_name, gymId) => {
    mockAthlete.primary_gym_id = gymId;
    // Clips off: the Highlights carousel's own "Find a match" CTA tile is not the nudge card.
    mockGetMyHighlights.mockResolvedValue(highlightsPage([], { clipsEnabled: false }));
    const { findByText, queryByText, queryByLabelText } = render(
      React.createElement(DashboardScreen),
    );
    await findByText(LOADED);
    expect(queryByText("Current ELO Rating")).toBeNull();
    expect(queryByText("Find a match")).toBeNull();
    expect(queryByText("You're live")).toBeNull();
    expect(queryByText(/Go live in the Arena/)).toBeNull();
    expect(queryByText(/Enter the Arena|Open the Arena/)).toBeNull();
    expect(queryByLabelText("Go to the Arena")).toBeNull();
  });

  it("makes no gym or session reads", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    mockAthlete.primary_gym_id = "g1";
    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText(LOADED)).toBeTruthy();
    });
    expect(queries.getDashboardSummary).toHaveBeenCalledTimes(1);
    expect(queries.getActiveSession).not.toHaveBeenCalled();
    expect(queries.getGymDetail).not.toHaveBeenCalled();
    expect(queries.getGymDetailResult).not.toHaveBeenCalled();
    expect(queries.getGymsWithSessions).not.toHaveBeenCalled();
    expect(queries.getGymsWithSessionsResult).not.toHaveBeenCalled();
  });

  it("renders no session or gym copy", async () => {
    const { getByText, queryByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText(LOADED)).toBeTruthy();
    });
    expect(queryByText(/session/i)).toBeNull();
    expect(queryByText(/Enter Lobby|Check In/)).toBeNull();
  });

  it("opens the match detail screen from a Me row, with no coming-soon toast", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getDashboardSummary.mockResolvedValue({
      ...mockSummary,
      recent_matches: [
        {
          match_id: "m-42",
          opponent_name: "Demo Red",
          outcome: "win",
          match_type: "ranked",
          elo_delta: 12,
          completed_at: "2026-09-24T12:00:00.000Z",
        },
      ],
    });
    const { toast } = require("@/components/ui/toast") as { toast: { info: jest.Mock } };
    const { findByLabelText } = render(React.createElement(DashboardScreen));

    fireEvent.press(await findByLabelText("row m-42"));

    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/m-42");
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("refetches the summary when the tab regains focus, not on the first focus", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText(LOADED)).toBeTruthy();
    });
    expect(queries.getDashboardSummary).toHaveBeenCalledTimes(1);

    // A quick tab switch inside the throttle window does not refetch.
    act(() => {
      mockFocusCallbacks.forEach((cb) => cb());
    });
    expect(queries.getDashboardSummary).toHaveBeenCalledTimes(1);

    refocus();

    await waitFor(() => {
      expect(queries.getDashboardSummary).toHaveBeenCalledTimes(2);
    });
  });

  it("renders the recent activity section", async () => {
    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("RecentActivitySection")).toBeTruthy();
    });
  });
});

describe("DashboardScreen (zero state)", () => {
  it("renders zero values when there are no matches", async () => {
    const queries = require("@jits/shared/api/queries") as {
      getDashboardSummary: jest.Mock;
    };
    queries.getDashboardSummary.mockResolvedValue({
      stats: null,
      rank: null,
      recent_matches: [],
      recent_activity: [],
    });

    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("1200")).toBeTruthy(); // the header rating, from the athlete
      expect(getByText(LOADED)).toBeTruthy();
    });
  });
});

describe("DashboardScreen (loading)", () => {
  it("paints the header rating before the summary has loaded", async () => {
    const queries = require("@jits/shared/api/queries") as {
      getDashboardSummary: jest.Mock;
    };
    queries.getDashboardSummary.mockReturnValue(new Promise(() => {}));

    const { getByTestId, queryByText } = render(React.createElement(DashboardScreen));
    // The rating reads only the athlete, so it is on the first frame.
    expect(getByTestId("header-elo-value")).toHaveTextContent("1200");
    // The summary-driven sections are still behind the skeleton.
    expect(queryByText("RecentActivitySection")).toBeNull();
    await settleActiveMatchRead();
  });
});

// The Arena nudge card is gone from Home (P-Home, jits-02vo.1): neither the
// offline "Find a match" nor the live "You're live" variant shows, whatever
// the arena store says.
describe("DashboardScreen without the Arena nudge card", () => {
  const store = require("@/lib/arena/arena-store") as typeof import("@/lib/arena/arena-store");

  afterEach(() => {
    store.__resetArenaStoreForTests();
  });

  it.each([
    ["offline", false],
    ["live", true],
  ])("shows no nudge copy while %s", async (_name, isLive) => {
    mockGetMyHighlights.mockResolvedValue(highlightsPage([], { clipsEnabled: false }));
    act(() => {
      store.publishArenaState({ ...store.IDLE_ARENA_STATE, isLive });
    });
    const { queryByText, queryByLabelText } = render(React.createElement(DashboardScreen));
    expect(queryByText("Find a match")).toBeNull();
    expect(queryByText("You're live")).toBeNull();
    expect(queryByText("You're in the lobby. Challenges reach you on any tab.")).toBeNull();
    expect(queryByLabelText("Go to the Arena")).toBeNull();
    await settleActiveMatchRead();
  });
});

// jits-r9a: an app killed mid-match leaves the match open with no way back.
// Home offers it as a card (never an automatic navigation), and while it shows
// Resume is Home's one red CTA.
describe("DashboardScreen resume-match card", () => {
  const store = require("@/lib/arena/arena-store") as typeof import("@/lib/arena/arena-store");
  const open = {
    ok: true,
    data: { matchId: "99999999-9999-4999-8999-999999999999", status: "in_progress", opponentName: "Demo Red" },
  };

  afterEach(() => {
    store.__resetArenaStoreForTests();
  });

  it("shows nothing extra when no match is open, and no red CTA at all", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    const utils = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(queries.getMyActiveMatch).toHaveBeenCalledTimes(1));
    expect(queries.getMyActiveMatch.mock.calls[0][1]).toBe(mockAthlete.id);
    expect(utils.queryByLabelText("Resume your match")).toBeNull();
    await utils.findByText(LOADED);
    expect(redCtas(utils)).toHaveLength(0);
  });

  it("offers the open match, pushes the Arena match route on tap, and never navigates by itself", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getMyActiveMatch.mockResolvedValue(open);
    const utils = render(React.createElement(DashboardScreen));
    const { findByLabelText, getByText } = utils;

    const resume = await findByLabelText("Resume your match");
    expect(getByText("Match in progress")).toBeTruthy();
    expect(getByText(/vs Demo Red/)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();

    // One Signal Red CTA per surface: Resume takes it.
    expect(resume.props.className).toContain("bg-cta");
    expect(redCtas(utils)).toHaveLength(1);

    fireEvent.press(resume);
    expect(mockPush).toHaveBeenCalledWith("/match/99999999-9999-4999-8999-999999999999");
  });

  it("words a not-yet-started match as waiting", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getMyActiveMatch.mockResolvedValue({
      ok: true,
      data: { matchId: "99999999-9999-4999-8999-999999999999", status: "pending", opponentName: null },
    });
    const { findByText, queryByText } = render(React.createElement(DashboardScreen));
    expect(await findByText("Match waiting to start")).toBeTruthy();
    expect(queryByText("Waiting")).toBeTruthy();
    expect(queryByText(/vs /)).toBeNull();
  });

  it("re-reads on every focus, without the summary's throttle", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    render(React.createElement(DashboardScreen));
    await waitFor(() => expect(queries.getMyActiveMatch).toHaveBeenCalledTimes(1));

    queries.getMyActiveMatch.mockResolvedValue(open);
    act(() => {
      mockFocusCallbacks.forEach((cb) => cb());
    });
    await waitFor(() => expect(queries.getMyActiveMatch).toHaveBeenCalledTimes(2));
  });

  it("drops the card once a match screen closes and the match is over", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getMyActiveMatch.mockResolvedValue(open);
    const { findByLabelText, queryByLabelText } = render(React.createElement(DashboardScreen));
    await findByLabelText("Resume your match");

    // A match screen mounts and unmounts: the exit counter bumps.
    queries.getMyActiveMatch.mockResolvedValue({ ok: true, data: null });
    function MatchScreen() {
      store.useArenaMatchScreen("00000000-0000-4000-8000-000000000000");
      return null;
    }
    const matchScreen = render(React.createElement(MatchScreen));
    // Unmount inside an async act: the exit bumps the counter, Home's exit
    // effect starts the re-read, and act only returns once that read has
    // resolved and its state update has been committed. Awaiting the update
    // itself, not a timeout, is what keeps this deterministic on a slow runner.
    await act(async () => {
      matchScreen.unmount();
    });

    expect(queries.getMyActiveMatch).toHaveBeenCalledTimes(2);
    expect(queryByLabelText("Resume your match")).toBeNull();
  });

  it("never offers a match the athlete left in this app process", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getMyActiveMatch.mockResolvedValue(open);
    const { findByLabelText } = render(React.createElement(DashboardScreen));
    await findByLabelText("Resume your match");
    // Nothing left yet: the first read excludes nothing.
    expect(queries.getMyActiveMatch.mock.calls[0][3]).toEqual([]);

    // The athlete opens m-9 and backs out of it on purpose.
    function MatchScreen() {
      store.useArenaMatchScreen("99999999-9999-4999-8999-999999999999");
      return null;
    }
    const matchScreen = render(React.createElement(MatchScreen));
    matchScreen.unmount();

    // The exit re-read asks the server to leave m-9 out.
    await waitFor(() => expect(queries.getMyActiveMatch).toHaveBeenCalledTimes(2));
    expect(queries.getMyActiveMatch.mock.calls[1][3]).toEqual(["99999999-9999-4999-8999-999999999999"]);
  });

  it("tags the card In progress / Waiting", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getMyActiveMatch.mockResolvedValue(open);
    const { findByText, queryByText } = render(React.createElement(DashboardScreen));
    expect(await findByText("In progress")).toBeTruthy();
    expect(queryByText("Live")).toBeNull();
  });

  it("keeps the card when a re-read fails", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getMyActiveMatch.mockResolvedValue(open);
    const { findByLabelText, getByLabelText } = render(React.createElement(DashboardScreen));
    await findByLabelText("Resume your match");

    queries.getMyActiveMatch.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "offline" },
    });
    act(() => {
      mockFocusCallbacks.forEach((cb) => cb());
    });
    await waitFor(() => expect(queries.getMyActiveMatch).toHaveBeenCalledTimes(2));
    expect(getByLabelText("Resume your match")).toBeTruthy();
  });
});

// Timekeeper mode A20, A24, PM20 (spec 9.1): the match this athlete TIMEKEEPS.
describe("DashboardScreen timekeeper card (A20)", () => {
  const ATHLETES = [
    { athleteId: "c-1", displayName: "Mina Reyes" },
    { athleteId: "o-1", displayName: "Dan Okafor" },
  ];
  const tk = (over: Record<string, unknown> = {}) => ({
    ok: true,
    data: {
      matchId: "tk-match-1",
      status: "in_progress",
      startedAt: "2026-10-20T12:00:00Z",
      endedAt: null,
      athletes: ATHLETES,
      reviewPending: false,
      editOpen: false,
      editClosesAt: null,
      ...over,
    },
  });
  const athleteOpen = {
    ok: true,
    data: { matchId: "99999999-9999-4999-8999-999999999999", status: "in_progress", opponentName: "Demo Red" },
  };

  afterEach(() => {
    mockGetMyTimekeepingMatch.mockImplementation(() => Promise.resolve({ ok: true, data: null }));
    mockInvitesOn = false;
    mockHasEverPlayed = false;
    // A test that drives the device clock with fake timers hands it back.
    jest.useRealTimers();
  });

  it("on duty: the TIMEKEEPER card with the matchup, TK-H3 and the one red CTA; a tap opens the match, nothing auto-navigates", async () => {
    mockGetMyTimekeepingMatch.mockImplementation(() => Promise.resolve(tk()));
    const utils = render(React.createElement(DashboardScreen));
    const card = await utils.findByTestId("timekeeping-resume-card");
    expect(utils.getByTestId("timekeeping-resume-role")).toHaveTextContent("TIMEKEEPER");
    expect(utils.getByTestId("timekeeping-resume-title")).toHaveTextContent("M. Reyes vs D. Okafor");
    expect(utils.getByTestId("timekeeping-resume-line")).toHaveTextContent("You run the clock and record the result.");
    expect(card).toBeTruthy();
    // Not the athlete card.
    expect(utils.queryByLabelText("Resume your match")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    const cta = utils.getByLabelText("Back to the match");
    expect(redCtas(utils)).toHaveLength(1);
    fireEvent.press(cta);
    expect(mockPush).toHaveBeenCalledWith("/match/tk-match-1");
  });

  it("after the clock ended: TK-H4", async () => {
    mockGetMyTimekeepingMatch.mockImplementation(() => Promise.resolve(tk({ endedAt: "2026-10-20T12:06:00Z" })));
    const utils = render(React.createElement(DashboardScreen));
    expect(await utils.findByText("The result is waiting on you.")).toBeTruthy();
    expect(utils.getByLabelText("Back to the match")).toBeTruthy();
  });

  it("in the edit window: Review result BELOW the athlete's Resume card, which keeps the one red CTA (PM20)", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getMyActiveMatch.mockResolvedValue(athleteOpen);
    mockGetMyTimekeepingMatch.mockImplementation(() =>
      Promise.resolve(tk({ status: "completed", endedAt: "2026-10-20T12:06:00Z", editOpen: true, editClosesAt: new Date(mockNow + 20 * 60_000).toISOString() })),
    );
    const utils = render(React.createElement(DashboardScreen));
    await utils.findByTestId("timekeeping-resume-card");
    await utils.findByLabelText("Resume your match");
    expect(utils.getByTestId("timekeeping-resume-line").props.children).toMatch(/^Result recorded\. You can fix it until .+\.$/);
    const review = utils.getByLabelText("Review result");
    expect(review.props.className ?? "").not.toMatch(/(^|\s)bg-cta(\s|$)/);
    expect(redCtas(utils)).toHaveLength(1);
    // The athlete card first, the timekeeper card below it.
    type Node = { props: { testID?: unknown; accessibilityLabel?: unknown } };
    const all: Node[] = utils.UNSAFE_root.findAll((n: Node) => n.props.testID === "timekeeping-resume-card" || n.props.accessibilityLabel === "Resume your match");
    const athleteAt = all.findIndex((n) => n.props.accessibilityLabel === "Resume your match");
    const tkAt = all.findIndex((n) => n.props.testID === "timekeeping-resume-card");
    expect(athleteAt).toBeGreaterThanOrEqual(0);
    expect(tkAt).toBeGreaterThan(athleteAt);
  });

  it("on duty, a never-played athlete gets no practice offer: the timekeeper card keeps the one red CTA", async () => {
    // Practice-eligible but for the duty: no matches, never played, never offered.
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getDashboardSummary.mockResolvedValue({
      ...mockSummary,
      stats: { wins: 0, losses: 0, draws: 0, win_streak: 0, best_win_streak: 0 },
    });
    mockHasEverPlayed = false;
    mockGetMyTimekeepingMatch.mockImplementation(() => Promise.resolve(tk()));
    const utils = render(React.createElement(DashboardScreen));
    await utils.findByTestId("timekeeping-resume-card");
    await utils.findByText(LOADED);
    expect(utils.queryByTestId("practice-offer-card")).toBeNull();
    expect(utils.getByLabelText("Back to the match").props.className).toMatch(/(^|\s)bg-cta(\s|$)/);
    expect(redCtas(utils)).toHaveLength(1);
  });

  it("on duty with an athlete Resume card too (defensive, R2 forbids it): Resume keeps the one red CTA", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getMyActiveMatch.mockResolvedValue(athleteOpen);
    mockGetMyTimekeepingMatch.mockImplementation(() => Promise.resolve(tk()));
    const utils = render(React.createElement(DashboardScreen));
    await utils.findByTestId("timekeeping-resume-card");
    const resume = await utils.findByLabelText("Resume your match");
    expect(resume.props.className).toMatch(/(^|\s)bg-cta(\s|$)/);
    expect(utils.getByLabelText("Back to the match").props.className ?? "").not.toMatch(/(^|\s)bg-cta(\s|$)/);
    expect(redCtas(utils)).toHaveLength(1);
  });

  it("hides the invite card while it shows; the invite card comes back once the edit window closes, with no new read", async () => {
    // Fake timers own the device clock (Date.now) and the card's own deadline
    // timer, so the window closes exactly when the test advances the clock,
    // inside act, never on the wall clock of a loaded runner.
    jest.useFakeTimers({ now: mockNow });
    mockInvitesOn = true;
    const closesAt = Date.now() + 20 * 60_000;
    mockGetMyTimekeepingMatch.mockImplementation(() =>
      Promise.resolve(tk({ status: "completed", endedAt: "2026-10-20T12:06:00Z", editOpen: true, editClosesAt: new Date(closesAt).toISOString() })),
    );
    const utils = render(React.createElement(DashboardScreen));
    await utils.findByTestId("timekeeping-resume-card");
    await utils.findByText(LOADED);
    expect(utils.queryByTestId("home-invite-card")).toBeNull();
    const reads = mockGetMyTimekeepingMatch.mock.calls.length;

    // One ms before the window closes on this device's clock: still the timekeeper's card.
    act(() => {
      jest.advanceTimersByTime(closesAt - 1 - Date.now());
    });
    expect(utils.getByTestId("timekeeping-resume-card")).toBeTruthy();
    expect(utils.queryByTestId("home-invite-card")).toBeNull();

    // The window closes: the card's own timer re-renders Home.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(utils.getByTestId("home-invite-card")).toBeTruthy();
    expect(utils.queryByTestId("timekeeping-resume-card")).toBeNull();
    expect(mockGetMyTimekeepingMatch.mock.calls.length).toBe(reads);
  });

  it("no card once the edit window has closed, or with nothing to timekeep", async () => {
    mockGetMyTimekeepingMatch.mockImplementation(() =>
      Promise.resolve(tk({ status: "completed", editOpen: true, editClosesAt: new Date(mockNow - 1000).toISOString() })),
    );
    const closed = render(React.createElement(DashboardScreen));
    await closed.findByText(LOADED);
    await act(async () => {});
    expect(closed.queryByTestId("timekeeping-resume-card")).toBeNull();
    closed.unmount();

    mockGetMyTimekeepingMatch.mockImplementation(() => Promise.resolve({ ok: true, data: null }));
    const none = render(React.createElement(DashboardScreen));
    await none.findByText(LOADED);
    await act(async () => {});
    expect(none.queryByTestId("timekeeping-resume-card")).toBeNull();
  });
});

// specs/matches-tab section 7 (owner round 2): ONE carousel titled
// Highlights replaces the "Your new highlight" card. Own reels in phase 1.
describe("DashboardScreen Highlights carousel (specs/matches-tab 7)", () => {
  const store = require("@/lib/arena/arena-store") as typeof import("@/lib/arena/arena-store");
  function reel(id: string, over: Record<string, unknown> = {}) {
    return {
      highlightId: id,
      matchId: `m-${id}`,
      matchVideoId: `v-${id}`,
      version: 2,
      durationS: 28.4,
      posterPath: `${id}.jpg`,
      readyAt: "2026-10-06T10:00:00Z",
      opponentName: "Demo Red",
      matchType: "ranked",
      outcome: "win",
      playedAt: "2026-10-06T09:00:00Z",
      notifiedAt: null,
      unseen: false,
      origin: null,
      ...over,
    };
  }
  const ZERO = { wins: 0, losses: 0, draws: 0, win_streak: 0, best_win_streak: 0 };

  afterEach(() => {
    store.__resetArenaStoreForTests();
    // A test that drives the banner's timers with fake timers hands them back.
    jest.useRealTimers();
  });

  it("arms notification routing once Home is up", async () => {
    render(React.createElement(DashboardScreen));
    await waitFor(() => expect(mockRouterReady).toHaveBeenCalled());
  });

  it("renders one Highlights carousel below Resume and above Recent Activity; the old card and 'Your reels' are gone", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getMyActiveMatch.mockResolvedValue({
      ok: true,
      data: { matchId: "99999999-9999-4999-8999-999999999999", status: "in_progress", opponentName: "Demo Red" },
    });
    mockGetMyHighlights.mockResolvedValue(highlightsPage([reel("h1", { unseen: true }), reel("h2")]));
    const utils = render(React.createElement(DashboardScreen));
    await utils.findByTestId("reel-tile-ready:h1");
    await utils.findByLabelText("Resume your match");

    expect(utils.getAllByTestId("reel-carousel-home")).toHaveLength(1);
    expect(utils.getByText("Highlights")).toBeTruthy();
    expect(utils.queryByText(/Your reels/i)).toBeNull();
    expect(utils.queryByTestId("new-highlight-card")).toBeNull();
    expect(utils.queryByText("Your new highlight")).toBeNull();

    const order = utils.root
      .findAll(
        (n: { props: Record<string, unknown> }) =>
          n.props.accessibilityLabel === "Resume your match" ||
          n.props.testID === "reel-carousel-home" ||
          n.props.children === LOADED,
      )
      .map((n: { props: Record<string, unknown> }) =>
        n.props.testID === "reel-carousel-home" ? "carousel" : n.props.accessibilityLabel === "Resume your match" ? "resume" : "activity",
      )
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
    expect(order).toEqual(["resume", "carousel", "activity"]);
    // Resume keeps Home's one red CTA; the carousel draws none.
    expect(redCtas(utils)).toHaveLength(1);
  });

  it("opens the tapped reel in the swipe viewer (lane session, source=home) and logs home_card_tapped", async () => {
    mockGetMyHighlights.mockResolvedValue(highlightsPage([reel("h1", { unseen: true }), reel("h2")]));
    const utils = render(React.createElement(DashboardScreen));
    fireEvent.press(await utils.findByTestId("reel-tile-ready:h2"));
    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/highlight\/h2\?source=home&lane=home&session=.+/));
    const token = new URLSearchParams(String(mockPush.mock.calls[0][0]).split("?")[1]).get("session");
    const { getReelSession } = require("@/lib/highlight/reel-viewer-session") as typeof import("@/lib/highlight/reel-viewer-session");
    const session = getReelSession(token ?? undefined);
    // Ready items only, in tile order, opened at the tapped one.
    expect(session?.items.map((i) => i.highlightId)).toEqual(["h1", "h2"]);
    expect(session?.startIndex).toBe(1);
    expect(mockLogEvent).toHaveBeenCalledWith(
      {},
      "h2",
      "home_card_tapped",
      expect.objectContaining({ source: "home", surface: "carousel", position: 1, unseen: false, reel_source: "own" }),
    );
  });

  it("zero matches: the C-HZ1 CTA tile (not red) and the C-Z2 ghost; the CTA switches to the Arena tab", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getDashboardSummary.mockResolvedValue({ ...mockSummary, stats: ZERO });
    const utils = render(React.createElement(DashboardScreen));
    const cta = await utils.findByLabelText("Get your first highlight. Opens the Arena tab");
    expect(utils.getByLabelText("Your first highlight lands here")).toBeTruthy();
    expect(cta.props.className ?? "").not.toMatch(/bg-cta/);
    fireEvent.press(cta);
    expect(mockNavigate).toHaveBeenCalledWith("/arena");
    expect(mockCapture).toHaveBeenCalledWith("matches.empty_cta", { level: "info", tags: { surface: "home", state: "zero", cta: "arena" } });
  });

  it("the first highlight celebrates over the carousel (C-C3), once, and logs matches.milestone_shown", async () => {
    // Fake timers own the banner's 4 s hold, its fade and the reel motions:
    // the tap's dismissal lands when the test advances the clock, never on a
    // real-time window that a loaded runner can miss.
    jest.useFakeTimers({ now: mockNow });
    (require("@/lib/milestones/milestone-store") as { __resetMilestonesForTests: () => void }).__resetMilestonesForTests();
    mockGetMyHighlights.mockResolvedValue(highlightsPage([reel("h1", { unseen: true, readyAt: new Date(mockNow - 60_000).toISOString() })]));
    const utils = render(React.createElement(DashboardScreen));
    await utils.findByTestId("reel-tile-ready:h1");
    const banner = await utils.findByTestId("milestone-banner-first_highlight");
    expect(banner.props.accessibilityLabel).toBe("Your first highlight is ready");
    expect(mockCapture).toHaveBeenCalledWith("matches.milestone_shown", { level: "info", tags: { milestone: "first_highlight" } });
    // The tap starts the fade; the banner leaves once the fade has run.
    fireEvent.press(banner);
    act(() => {
      jest.advanceTimersByTime(duration.fast);
    });
    expect(utils.queryByTestId("milestone-banner-first_highlight")).toBeNull();
    // A later visit (remount) does not celebrate again: let its milestone
    // decision (the marks load) land before asserting there is no banner.
    utils.unmount();
    const again = render(React.createElement(DashboardScreen));
    await again.findByTestId("reel-tile-ready:h1");
    await act(async () => {});
    expect(again.queryByTestId("milestone-banner-first_highlight")).toBeNull();
    expect(mockCapture.mock.calls.filter((c) => c[0] === "matches.milestone_shown")).toHaveLength(1);
  });

  it("matches but no reels: the C-L2 CTA tile then the C-L5 ghost with the recording helper", async () => {
    const utils = render(React.createElement(DashboardScreen));
    const cta = await utils.findByLabelText("Find a match. Opens the Arena tab");
    expect(utils.getByLabelText("Record your next match to get a highlight")).toBeTruthy();
    fireEvent.press(cta);
    expect(mockCapture).toHaveBeenCalledWith("matches.empty_cta", { level: "info", tags: { surface: "home", state: "no_reels", cta: "arena" } });
    expect(utils.getByText("Turn on Record from my phone at face-off.")).toBeTruthy();
  });

  it("hides the carousel with clips off", async () => {
    mockGetMyHighlights.mockResolvedValue(highlightsPage([reel("h1")], { clipsEnabled: false }));
    const utils = render(React.createElement(DashboardScreen));
    await utils.findByText(LOADED);
    await waitFor(() => expect(mockGetMyHighlights).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(utils.queryByTestId("reel-carousel-home")).toBeNull();
    expect(utils.queryByText("Highlights")).toBeNull();
  });

  it("hides the carousel quietly when the read fails (no error on Home)", async () => {
    mockGetMyHighlights.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const { toast } = require("@/components/ui/toast") as { toast: { error: jest.Mock } };
    const utils = render(React.createElement(DashboardScreen));
    await utils.findByText(LOADED);
    await waitFor(() => expect(mockGetMyHighlights).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(utils.queryByTestId("reel-carousel-home")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows three skeleton tiles while the first read is in flight", async () => {
    mockGetMyHighlights.mockReturnValue(new Promise(() => {}));
    const utils = render(React.createElement(DashboardScreen));
    const hidden = { includeHiddenElements: true };
    expect(await utils.findByTestId("reel-tile-skeleton:2", hidden)).toBeTruthy();
    expect(utils.queryByTestId("reel-tile-skeleton:3", hidden)).toBeNull();
    await settleActiveMatchRead();
  });

  it("holds the skeletons while the match count is unknown (no wrong empty-state copy flashes)", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getDashboardSummary.mockReturnValue(new Promise(() => {}));
    const utils = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(mockGetMyHighlights).toHaveBeenCalled());
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    expect(utils.getByTestId("reel-tile-skeleton:0", { includeHiddenElements: true })).toBeTruthy();
    expect(utils.queryByLabelText(/Opens the Arena tab/)).toBeNull();
  });

  it("pull to refresh re-reads the lane", async () => {
    const utils = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(mockGetMyHighlights).toHaveBeenCalledTimes(1));
    mockGetMyHighlights.mockResolvedValue(highlightsPage([reel("h9")]));
    const scroll = utils.UNSAFE_getByType(require("react-native").ScrollView);
    await act(async () => {
      scroll.props.refreshControl.props.onRefresh();
    });
    expect(await utils.findByTestId("reel-tile-ready:h9")).toBeTruthy();
  });

});

describe("DashboardScreen practice match offer", () => {
  beforeEach(() => {
    mockHasEverPlayed = false;
  });
  const ZERO = { wins: 0, losses: 0, draws: 0, win_streak: 0, best_win_streak: 0 };

  function zeroMatches() {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getDashboardSummary.mockResolvedValue({ ...mockSummary, stats: ZERO });
  }

  it("offers the practice match to a brand-new athlete as Home's one red CTA", async () => {
    zeroMatches();
    const utils = render(React.createElement(DashboardScreen));
    expect(await utils.findByTestId("practice-offer-card")).toBeTruthy();
    // One Signal Red CTA: the practice card holds it.
    expect(utils.getByTestId("practice-offer-start").props.className).toContain("bg-cta");
    expect(redCtas(utils)).toHaveLength(1);
  });

  it("does not offer to an athlete with completed matches", async () => {
    const { getByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(LOADED)).toBeTruthy());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });

  it("does not offer to someone who has played a match with no confirmed result yet", async () => {
    zeroMatches();
    mockHasEverPlayed = true;
    const { getByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(LOADED)).toBeTruthy());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });

  it("does not offer while the match history is unknown", async () => {
    zeroMatches();
    mockHasEverPlayed = null;
    const { getByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(LOADED)).toBeTruthy());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });

  it("does not offer after a practice match", async () => {
    zeroMatches();
    mockAthlete.practice_match_completed_at = "2026-09-27T00:00:00Z";
    const { getByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(LOADED)).toBeTruthy());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });

  it("does not offer once the athlete has answered", async () => {
    zeroMatches();
    mockAthlete.practice_match_offered_at = "2026-09-26T00:00:00Z";
    const { getByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(LOADED)).toBeTruthy());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });

  it("does not offer to a bot", async () => {
    zeroMatches();
    mockAthlete.is_bot = true;
    const { getByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(LOADED)).toBeTruthy());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });

  it("does not offer over a match in flight", async () => {
    zeroMatches();
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getMyActiveMatch.mockResolvedValue({
      ok: true,
      data: { matchId: "m1", status: "in_progress", opponentName: "X" },
    });
    const { getByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(LOADED)).toBeTruthy());
    await waitFor(() => expect(getByText("Match in progress")).toBeTruthy());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });

  it("Not now hides the card at once and marks skipped once", async () => {
    zeroMatches();
    const { markPracticeMatch } = require("@jits/shared/api/mutations") as {
      markPracticeMatch: jest.Mock;
    };
    const { findByTestId, queryByTestId, getByTestId } = render(
      React.createElement(DashboardScreen),
    );
    await findByTestId("practice-offer-card");
    fireEvent.press(getByTestId("practice-offer-not-now"));
    expect(queryByTestId("practice-offer-card")).toBeNull();
    expect(markPracticeMatch).toHaveBeenCalledTimes(1);
    expect(markPracticeMatch).toHaveBeenCalledWith({}, "skipped");
    await waitFor(() => expect(mockRefreshSoft).toHaveBeenCalled());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });
});
