import * as React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

// ---- mocks ----

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

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

jest.mock("@/components/dashboard/recent-activity-section", () => ({
  RecentActivitySection: () => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.Text, {}, "RecentActivitySection");
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
  mockAthlete.primary_gym_id = null;
  mockAthlete.id = `a${++athleteSeq}`;
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
