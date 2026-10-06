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
  useAuth: () => ({ refreshAthleteSoft: mockRefreshSoft }),
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
jest.mock("@/lib/notifications/handlers", () => ({
  markNotificationRouterReady: () => mockRouterReady(),
}));
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});

import DashboardScreen from "@/app/(app)/(tabs)/(home)/index";
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

// The record line inside the Elo tile for mockSummary (5-2-1) and for zero.
const RECORD = "5W · 2L · 1D";
const ZERO_RECORD = "0W · 0L · 0D";

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
  it("renders the greeting with the athlete name", async () => {
    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("TestUser")).toBeTruthy();
    });
  });

  it("renders ELO from the hero tile after data loads", async () => {
    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      // EloTile renders the value as a Text node. The hero ELO comes from
      // the active athlete (not the summary), so it always renders.
      expect(getByText("1200")).toBeTruthy();
    });
  });

  // P-Home (jits-02vo.1): the record rides inside the Elo tile as one mono
  // meta line; there is no separate Record section.
  it("renders the record inside the Elo tile, with a spoken label", async () => {
    const { findByText, getByText, queryByText } = render(React.createElement(DashboardScreen));
    const line = await findByText(RECORD);
    expect(line.props.testID).toBe("elo-tile-meta");
    expect(line.props.accessibilityLabel).toBe("Record: 5 wins, 2 losses, 1 draw");
    expect(getByText("1200")).toBeTruthy();
    expect(queryByText("Record")).toBeNull();
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
    await findByText(RECORD);
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
      expect(getByText(RECORD)).toBeTruthy();
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
      expect(getByText(RECORD)).toBeTruthy();
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
      expect(getByText(RECORD)).toBeTruthy();
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

describe("DashboardScreen greeting", () => {
  it("says Welcome back to an athlete with matches", async () => {
    const { findByText, queryByText } = render(React.createElement(DashboardScreen));
    expect(await findByText("Welcome back")).toBeTruthy();
    expect(queryByText("Welcome")).toBeNull();
  });

  it("says Welcome (not back) to a brand-new athlete with zero matches", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getDashboardSummary.mockResolvedValue({
      ...mockSummary,
      stats: { wins: 0, losses: 0, draws: 0, win_streak: 0, best_win_streak: 0, total_matches: 0 },
    });
    const { getByText, queryByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(ZERO_RECORD)).toBeTruthy());
    expect(getByText("Welcome")).toBeTruthy();
    expect(queryByText("Welcome back")).toBeNull();
  });

  it("says Welcome when the summary has no stats (brand-new athlete)", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getDashboardSummary.mockResolvedValue({ ...mockSummary, stats: null });
    const { getByText, queryByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(ZERO_RECORD)).toBeTruthy());
    expect(getByText("Welcome")).toBeTruthy();
    expect(queryByText("Welcome back")).toBeNull();
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
      expect(getByText("1200")).toBeTruthy(); // ELO from athlete
      expect(getByText(ZERO_RECORD).props.accessibilityLabel).toBe(
        "Record: 0 wins, 0 losses, 0 draws",
      );
    });
  });
});

describe("DashboardScreen (loading)", () => {
  it("shows the athlete name while data is loading", async () => {
    const queries = require("@jits/shared/api/queries") as {
      getDashboardSummary: jest.Mock;
    };
    queries.getDashboardSummary.mockReturnValue(new Promise(() => {}));

    const { getByText } = render(React.createElement(DashboardScreen));
    expect(getByText("TestUser")).toBeTruthy();
    await settleActiveMatchRead();
  });

  it("paints the rating before the summary has loaded, and the record line after", async () => {
    const queries = require("@jits/shared/api/queries") as {
      getDashboardSummary: jest.Mock;
    };
    queries.getDashboardSummary.mockReturnValue(new Promise(() => {}));

    const { getByText, queryByText, queryByTestId } = render(React.createElement(DashboardScreen));
    // The rating reads only the athlete, so it is on the first frame.
    expect(getByText("1200")).toBeTruthy();
    // The record needs the summary: no guessed 0-0-0 while it loads.
    expect(queryByTestId("elo-tile-meta")).toBeNull();
    // Its slot is held so the hero tile does not grow when the record lands.
    expect(
      queryByTestId("elo-tile-meta-placeholder", { includeHiddenElements: true }),
    ).toBeTruthy();
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
    await utils.findByText(RECORD);
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
  });

  it("arms notification routing once Home is up", async () => {
    render(React.createElement(DashboardScreen));
    await waitFor(() => expect(mockRouterReady).toHaveBeenCalled());
  });

  it("renders one Highlights carousel below Resume and above the greeting; the old card and 'Your reels' are gone", async () => {
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
          n.props.children === mockAthlete.display_name,
      )
      .map((n: { props: Record<string, unknown> }) =>
        n.props.testID === "reel-carousel-home" ? "carousel" : n.props.accessibilityLabel === "Resume your match" ? "resume" : "greeting",
      )
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
    expect(order).toEqual(["resume", "carousel", "greeting"]);
    // Resume keeps Home's one red CTA; the carousel draws none.
    expect(redCtas(utils)).toHaveLength(1);
  });

  it("opens the tapped reel through the lane seam with source=home and logs home_card_tapped", async () => {
    mockGetMyHighlights.mockResolvedValue(highlightsPage([reel("h1", { unseen: true }), reel("h2")]));
    const utils = render(React.createElement(DashboardScreen));
    fireEvent.press(await utils.findByTestId("reel-tile-ready:h2"));
    expect(mockPush).toHaveBeenCalledWith("/highlight/h2?source=home");
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
  });

  it("matches but no reels: the C-L2 CTA tile then the C-L5 ghost with the recording helper", async () => {
    const utils = render(React.createElement(DashboardScreen));
    expect(await utils.findByLabelText("Find a match. Opens the Arena tab")).toBeTruthy();
    expect(utils.getByLabelText("Record your next match to get a highlight")).toBeTruthy();
    expect(utils.getByText("Turn on Record from my phone at face-off.")).toBeTruthy();
  });

  it("hides the carousel with clips off", async () => {
    mockGetMyHighlights.mockResolvedValue(highlightsPage([reel("h1")], { clipsEnabled: false }));
    const utils = render(React.createElement(DashboardScreen));
    await utils.findByText(RECORD);
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
    await utils.findByText(RECORD);
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
    await waitFor(() => expect(getByText(RECORD)).toBeTruthy());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });

  it("does not offer to someone who has played a match with no confirmed result yet", async () => {
    zeroMatches();
    mockHasEverPlayed = true;
    const { getByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(ZERO_RECORD)).toBeTruthy());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });

  it("does not offer while the match history is unknown", async () => {
    zeroMatches();
    mockHasEverPlayed = null;
    const { getByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(ZERO_RECORD)).toBeTruthy());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });

  it("does not offer after a practice match", async () => {
    zeroMatches();
    mockAthlete.practice_match_completed_at = "2026-09-27T00:00:00Z";
    const { getByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(ZERO_RECORD)).toBeTruthy());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });

  it("does not offer once the athlete has answered", async () => {
    zeroMatches();
    mockAthlete.practice_match_offered_at = "2026-09-26T00:00:00Z";
    const { getByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(ZERO_RECORD)).toBeTruthy());
    expect(queryByTestId("practice-offer-card")).toBeNull();
  });

  it("does not offer to a bot", async () => {
    zeroMatches();
    mockAthlete.is_bot = true;
    const { getByText, queryByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText(ZERO_RECORD)).toBeTruthy());
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
    await waitFor(() => expect(getByText(ZERO_RECORD)).toBeTruthy());
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
