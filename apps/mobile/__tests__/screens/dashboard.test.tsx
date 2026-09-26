import * as React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

// ---- mocks ----

const mockPush = jest.fn();
const mockReplace = jest.fn();

// useFocusEffect runs its callback on mount (the first focus) and records it
// so a test can simulate the tab regaining focus.
const mockFocusCallbacks: (() => void)[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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

// New StatOverview signature is { wins, losses, draws } only — no rank/streak.
jest.mock("@/components/dashboard/stat-overview", () => ({
  StatOverview: ({
    stats,
  }: {
    stats: { wins: number; losses: number; draws: number };
  }) => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(
      RN.View,
      { testID: "stat-overview" },
      R.createElement(RN.Text, {}, `${stats.wins}W`),
      R.createElement(RN.Text, {}, `${stats.losses}L`),
      R.createElement(RN.Text, {}, `${stats.draws}D`),
    );
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
} = {
  id: "a1",
  display_name: "TestUser",
  current_elo: 1200,
  highest_elo: 1250,
  status: "active",
  profile_photo_url: null,
  primary_gym_id: null,
};

jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({
    user: { id: "u1" },
    athlete: mockAthlete,
    isLoading: false,
  }),
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
}));

jest.mock("@jits/shared/types/composites", () => ({}), { virtual: true });

import DashboardScreen from "@/app/(app)/(tabs)/(home)/index";
import { ARENA_HREF } from "@/lib/arena/constants";

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
  mockAthlete.primary_gym_id = null;
  mockAthlete.id = `a${++athleteSeq}`;
  mockFocusCallbacks.length = 0;
  jest.spyOn(Date, "now").mockImplementation(() => mockNow);
});

afterEach(() => {
  jest.restoreAllMocks();
});

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

  it("renders record stats after data loads", async () => {
    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("5W")).toBeTruthy();
      expect(getByText("2L")).toBeTruthy();
      expect(getByText("1D")).toBeTruthy();
    });
  });

  // The Arena is the only way to a match on mobile (jits-gewv), so Home must
  // always point there, for a gym member and a free agent alike.
  it.each([
    ["a free agent", null],
    ["a gym member", "g1"],
  ])("nudges %s toward the Arena", async (_name, gymId) => {
    mockAthlete.primary_gym_id = gymId;
    const { getByLabelText, getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("Find a match")).toBeTruthy();
    });
    fireEvent.press(getByLabelText("Go to the Arena"));
    expect(mockPush).toHaveBeenCalledWith(ARENA_HREF);
  });

  it("makes no gym or session reads", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    mockAthlete.primary_gym_id = "g1";
    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("5W")).toBeTruthy();
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
      expect(getByText("5W")).toBeTruthy();
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
      expect(getByText("5W")).toBeTruthy();
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
    await waitFor(() => expect(getByText("0W")).toBeTruthy());
    expect(getByText("Welcome")).toBeTruthy();
    expect(queryByText("Welcome back")).toBeNull();
  });

  it("says Welcome when the summary has no stats (brand-new athlete)", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getDashboardSummary.mockResolvedValue({ ...mockSummary, stats: null });
    const { getByText, queryByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(getByText("0W")).toBeTruthy());
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
      expect(getByText("0W")).toBeTruthy();
      expect(getByText("0L")).toBeTruthy();
      expect(getByText("0D")).toBeTruthy();
    });
  });
});

describe("DashboardScreen (loading)", () => {
  it("shows the athlete name while data is loading", () => {
    const queries = require("@jits/shared/api/queries") as {
      getDashboardSummary: jest.Mock;
    };
    queries.getDashboardSummary.mockReturnValue(new Promise(() => {}));

    const { getByText } = render(React.createElement(DashboardScreen));
    expect(getByText("TestUser")).toBeTruthy();
  });

  it("shows the Arena CTA before the summary has loaded", () => {
    const queries = require("@jits/shared/api/queries") as {
      getDashboardSummary: jest.Mock;
    };
    queries.getDashboardSummary.mockReturnValue(new Promise(() => {}));

    const { getByLabelText, queryByText } = render(React.createElement(DashboardScreen));
    fireEvent.press(getByLabelText("Go to the Arena"));
    expect(mockPush).toHaveBeenCalledWith(ARENA_HREF);
    // The summary-driven sections are still behind the skeleton.
    expect(queryByText("RecentActivitySection")).toBeNull();
  });
});

// Home's Arena card reads the live bit from the app-wide arena store and
// nothing else (jits-sq3a): while the header says LIVE, it must not tell the
// athlete to go live.
describe("DashboardScreen Arena card (live-aware)", () => {
  const store = require("@/lib/arena/arena-store") as typeof import("@/lib/arena/arena-store");

  afterEach(() => {
    store.__resetArenaStoreForTests();
  });

  it("invites an offline athlete to go live", () => {
    const { getByText, queryByText } = render(React.createElement(DashboardScreen));
    expect(getByText("Find a match")).toBeTruthy();
    expect(getByText(/Go live in the Arena/)).toBeTruthy();
    expect(getByText("Enter the Arena →")).toBeTruthy();
    expect(queryByText("You're live")).toBeNull();
  });

  it("says the athlete is already live, and still leads to the Arena", () => {
    act(() => {
      store.publishArenaState({ ...store.IDLE_ARENA_STATE, isLive: true });
    });
    const { getByText, queryByText, getByLabelText } = render(
      React.createElement(DashboardScreen),
    );

    expect(getByText("You're live")).toBeTruthy();
    expect(
      getByText("You're in the lobby. Challenges reach you on any tab."),
    ).toBeTruthy();
    expect(getByText("Open the Arena →")).toBeTruthy();
    expect(queryByText("Find a match")).toBeNull();
    expect(queryByText(/Go live in the Arena/)).toBeNull();

    fireEvent.press(getByLabelText("Go to the Arena"));
    expect(mockPush).toHaveBeenCalledWith(ARENA_HREF);
  });

  it("flips back when the athlete goes offline", () => {
    act(() => {
      store.publishArenaState({ ...store.IDLE_ARENA_STATE, isLive: true });
    });
    const { getByText, queryByText } = render(React.createElement(DashboardScreen));
    expect(getByText("You're live")).toBeTruthy();

    act(() => {
      store.publishArenaState({ ...store.IDLE_ARENA_STATE, isLive: false });
    });
    expect(getByText("Find a match")).toBeTruthy();
    expect(queryByText("You're live")).toBeNull();
  });
});

// jits-r9a: an app killed mid-match leaves the match open with no way back.
// Home offers it as a card (never an automatic navigation), and while it shows
// Resume is Home's one red CTA and the Arena button steps down.
describe("DashboardScreen resume-match card", () => {
  const store = require("@/lib/arena/arena-store") as typeof import("@/lib/arena/arena-store");
  const open = {
    ok: true,
    data: { matchId: "m-9", status: "in_progress", opponentName: "Demo Red" },
  };

  afterEach(() => {
    store.__resetArenaStoreForTests();
  });

  it("shows nothing extra when no match is open, and the Arena CTA stays red", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    const { getByLabelText, queryByLabelText } = render(React.createElement(DashboardScreen));
    await waitFor(() => expect(queries.getMyActiveMatch).toHaveBeenCalledTimes(1));
    expect(queries.getMyActiveMatch.mock.calls[0][1]).toBe(mockAthlete.id);
    expect(queryByLabelText("Resume your match")).toBeNull();
    expect(getByLabelText("Go to the Arena").props.className).toContain("bg-cta");
  });

  it("offers the open match, pushes the Arena match route on tap, and never navigates by itself", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getMyActiveMatch.mockResolvedValue(open);
    const { findByLabelText, getByText, getByLabelText } = render(
      React.createElement(DashboardScreen),
    );

    const resume = await findByLabelText("Resume your match");
    expect(getByText("Match in progress")).toBeTruthy();
    expect(getByText(/vs Demo Red/)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();

    // One Signal Red CTA per surface: Resume takes it, the Arena steps down.
    expect(resume.props.className).toContain("bg-cta");
    const arena = getByLabelText("Go to the Arena");
    expect(arena.props.className).not.toContain("bg-cta");
    expect(arena.props.className).toContain("border-hairline-strong");

    fireEvent.press(resume);
    expect(mockPush).toHaveBeenCalledWith("/match/m-9");
  });

  it("words a not-yet-started match as waiting", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getMyActiveMatch.mockResolvedValue({
      ok: true,
      data: { matchId: "m-9", status: "pending", opponentName: null },
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
    const { findByLabelText, queryByLabelText, getByLabelText } = render(
      React.createElement(DashboardScreen),
    );
    await findByLabelText("Resume your match");

    // A match screen mounts and unmounts: the exit counter bumps.
    queries.getMyActiveMatch.mockResolvedValue({ ok: true, data: null });
    function MatchScreen() {
      store.useArenaMatchScreen("m-other");
      return null;
    }
    const matchScreen = render(React.createElement(MatchScreen));
    matchScreen.unmount();

    await waitFor(() => expect(queryByLabelText("Resume your match")).toBeNull());
    expect(getByLabelText("Go to the Arena").props.className).toContain("bg-cta");
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
      store.useArenaMatchScreen("m-9");
      return null;
    }
    const matchScreen = render(React.createElement(MatchScreen));
    matchScreen.unmount();

    // The exit re-read asks the server to leave m-9 out.
    await waitFor(() => expect(queries.getMyActiveMatch).toHaveBeenCalledTimes(2));
    expect(queries.getMyActiveMatch.mock.calls[1][3]).toEqual(["m-9"]);
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
