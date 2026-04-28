import * as React from "react";
import { Text, View } from "react-native";
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

// Theme tokens
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ primary: "#ff0000", foreground: "#000000" }),
}));

// Supabase client
jest.mock("@/lib/supabase/client", () => ({
  supabase: {},
}));

// Toast
jest.mock("@/components/ui/toast", () => ({
  toast: { error: jest.fn(), info: jest.fn() },
}));

// Mock all heavy child components to isolate the screen
jest.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.View, { testID: "notification-bell" });
  },
}));

jest.mock("@/components/dashboard/stat-overview", () => ({
  StatOverview: ({
    athlete,
    stats,
  }: {
    athlete: { current_elo: number };
    stats: { wins: number; losses: number; draws: number; winStreak: number; rank: number };
  }) => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(
      RN.View,
      { testID: "stat-overview" },
      R.createElement(RN.Text, {}, String(athlete.current_elo)),
      R.createElement(RN.Text, {}, `#${stats.rank}`),
      R.createElement(RN.Text, {}, String(stats.wins)),
      R.createElement(RN.Text, {}, String(stats.losses)),
      R.createElement(RN.Text, {}, String(stats.draws)),
      R.createElement(RN.Text, {}, String(stats.winStreak)),
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

// The active athlete
const mockAthlete = {
  id: "a1",
  display_name: "TestUser",
  current_elo: 1200,
  highest_elo: 1250,
  status: "active",
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

jest.mock("@jits/shared/api/queries", () => ({
  getDashboardSummary: jest.fn().mockResolvedValue(mockSummary),
  getActiveSession: jest.fn().mockResolvedValue(null),
}));

jest.mock("@jits/shared/types/composites", () => ({}), { virtual: true });
jest.mock("@jits/shared/types/session", () => ({}), { virtual: true });

import DashboardScreen from "@/app/(app)/(home)/index";

beforeEach(() => {
  jest.clearAllMocks();
  // Re-wire the resolved value each test since clearAllMocks resets mockResolvedValue
  const queries = require("@jits/shared/api/queries") as {
    getDashboardSummary: jest.Mock;
    getActiveSession: jest.Mock;
  };
  queries.getDashboardSummary.mockResolvedValue(mockSummary);
  queries.getActiveSession.mockResolvedValue(null);
});

describe("DashboardScreen", () => {
  it("renders the greeting with the athlete name", async () => {
    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("TestUser")).toBeTruthy();
    });
  });

  it("renders ELO from stat overview after data loads", async () => {
    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("1200")).toBeTruthy();
    });
  });

  it("renders rank from stat overview after data loads", async () => {
    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("#7")).toBeTruthy();
    });
  });

  it("renders record stats after data loads", async () => {
    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("5")).toBeTruthy(); // wins
      expect(getByText("2")).toBeTruthy(); // losses
      expect(getByText("1")).toBeTruthy(); // draws
    });
  });

  it("renders the sessions section header", async () => {
    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("Sessions")).toBeTruthy();
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

    const { getByText, getAllByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("1200")).toBeTruthy(); // ELO from athlete
      // Multiple stats default to 0 (wins, losses, draws, winStreak)
      expect(getAllByText("0").length).toBeGreaterThanOrEqual(1);
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
