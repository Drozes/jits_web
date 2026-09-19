import * as React from "react";
import { render, waitFor } from "@testing-library/react-native";

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

jest.mock("@/components/dashboard/active-session-card", () => ({
  ActiveSessionCard: () => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.Text, {}, "ActiveSessionCard");
  },
}));

jest.mock("@/components/dashboard/recent-activity-section", () => ({
  RecentActivitySection: () => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.Text, {}, "RecentActivitySection");
  },
}));

// Discovery renders for real in
// __tests__/components/dashboard/session-discovery-section.test.tsx. Here it is
// stubbed to echo the props the dashboard feeds it, which is the contract this
// screen owns: the primary gym, that gym's sessions, and the free-agent
// live-gym list.
jest.mock("@/components/dashboard/session-discovery-section", () => ({
  SessionDiscoverySection: (props: {
    gymId: string | null;
    gymName: string | null;
    sessions: unknown[];
    liveGyms: unknown[];
  }) => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(
      RN.Text,
      { testID: "session-discovery" },
      `discovery:${props.gymId ?? "free-agent"}:${props.gymName ?? "-"}:${props.sessions.length}:${props.liveGyms.length}`,
    );
  },
}));

// The active athlete. `primary_gym_id` is overwritten per test to exercise both
// the member and the free-agent discovery paths.
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

const mockGymDetail = {
  id: "g1",
  name: "Test Gym",
  city: "Austin",
  status: "active",
  sessions: [
    {
      id: "s1",
      title: "Open Mat",
      scheduledStart: "2026-09-20T18:00:00.000Z",
      scheduledEnd: "2026-09-20T20:00:00.000Z",
      status: "scheduled",
      participantCount: 2,
      maxParticipants: null,
      rsvpCount: 1,
      createdBy: "a2",
      createdByName: "Coach",
    },
  ],
  rsvpSessionIds: [],
  participantSessionIds: [],
  memberCount: 12,
  isMemberGym: true,
  isGymManager: false,
};

const mockLiveGym = {
  id: "g9",
  name: "Live Gym",
  city: "Austin",
  status: "active",
  memberCount: 8,
  activeSessions: 1,
  upcomingSessions: 0,
  hasActiveSession: true,
  nextSessionStart: null,
};

jest.mock("@jits/shared/api/queries", () => ({
  getDashboardSummary: jest.fn().mockResolvedValue(mockSummary),
  getActiveSession: jest.fn().mockResolvedValue(null),
  getGymDetail: jest.fn().mockResolvedValue(null),
  getGymsWithSessions: jest.fn().mockResolvedValue([]),
}));

jest.mock("@jits/shared/types/composites", () => ({}), { virtual: true });
jest.mock("@jits/shared/types/session", () => ({}), { virtual: true });

import DashboardScreen from "@/app/(app)/(tabs)/(home)/index";

interface QueryMocks {
  getDashboardSummary: jest.Mock;
  getActiveSession: jest.Mock;
  getGymDetail: jest.Mock;
  getGymsWithSessions: jest.Mock;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-wire the resolved value each test since clearAllMocks resets mockResolvedValue
  const queries = require("@jits/shared/api/queries") as QueryMocks;
  queries.getDashboardSummary.mockResolvedValue(mockSummary);
  queries.getActiveSession.mockResolvedValue(null);
  queries.getGymDetail.mockResolvedValue(null);
  queries.getGymsWithSessions.mockResolvedValue([]);
  mockAthlete.primary_gym_id = null;
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

  // Discovery is the ONLY path to a new session since the Gyms tab was removed,
  // so Home must always mount it and must feed it the right gym.
  it("always renders the session discovery surface", async () => {
    const { getByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByTestId("session-discovery")).toBeTruthy();
    });
  });

  it("feeds discovery the primary gym and its sessions for a member", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    mockAthlete.primary_gym_id = "g1";
    queries.getGymDetail.mockResolvedValue(mockGymDetail);

    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("discovery:g1:Test Gym:1:0")).toBeTruthy();
    });
    expect(queries.getGymDetail).toHaveBeenCalledWith({}, "g1", "a1");
    // A member never pays for the gym-wide list; their own gym answers the question.
    expect(queries.getGymsWithSessions).not.toHaveBeenCalled();
  });

  it("feeds discovery the live-gym list for a free agent", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getGymsWithSessions.mockResolvedValue([mockLiveGym]);

    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("discovery:free-agent:-:0:1")).toBeTruthy();
    });
    expect(queries.getGymDetail).not.toHaveBeenCalled();
  });

  it("still renders the dashboard when the discovery reads fail", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    // The screen logs the swallowed rejection on purpose; keep it out of the
    // test output rather than leaving a red herring in the run.
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockAthlete.primary_gym_id = "g-broken";
    queries.getGymDetail.mockRejectedValue(new Error("boom"));

    const { getByText, getByTestId } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("5W")).toBeTruthy();
    });
    expect(getByTestId("session-discovery")).toBeTruthy();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
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
      getActiveSession: jest.Mock;
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
      getActiveSession: jest.Mock;
    };
    queries.getDashboardSummary.mockReturnValue(new Promise(() => {}));
    queries.getActiveSession.mockReturnValue(new Promise(() => {}));

    const { getByText } = render(React.createElement(DashboardScreen));
    expect(getByText("TestUser")).toBeTruthy();
  });
});
