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

// The active athlete
const mockAthlete = {
  id: "a1",
  display_name: "TestUser",
  current_elo: 1200,
  highest_elo: 1250,
  status: "active",
  profile_photo_url: null,
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

import DashboardScreen from "@/app/(app)/(tabs)/(home)/index";

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
