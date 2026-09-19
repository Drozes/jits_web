import * as React from "react";
import { RefreshControl } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";

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
    loadFailed?: boolean;
    onRetry?: () => void;
  }) => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(
      RN.Text,
      { testID: "session-discovery" },
      `discovery:${props.gymId ?? "free-agent"}:${props.gymName ?? "-"}:${props.sessions.length}:${props.liveGyms.length}:${props.loadFailed ? "failed" : "ok"}:${typeof props.onRetry === "function" ? "retryable" : "no-retry"}`,
    );
  },
}));

/**
 * The production failure shape for a discovery read: a RESOLVED
 * `{ ok: false }`, never a rejection. supabase-js does not reject (postgrest-js
 * sets shouldThrowOnError = false and converts even a hard fetch error into a
 * resolved `{ data: null, error }`), so a rejection-based test would certify a
 * path production cannot produce.
 */
const READ_FAILED = {
  ok: false as const,
  error: { code: "UNKNOWN" as const, message: "connection failure" },
};

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

// Home reads discovery through the Result variants (jits-icei.5). The
// null-collapsing originals are mocked too, so a test can assert the screen
// does NOT fall back to them: getGymDetail returning null cannot distinguish a
// gym with no sessions from a gym that could not be read, which is the bug.
jest.mock("@jits/shared/api/queries", () => ({
  getDashboardSummary: jest.fn().mockResolvedValue(mockSummary),
  getActiveSession: jest.fn().mockResolvedValue(null),
  getGymDetail: jest.fn().mockResolvedValue(null),
  getGymsWithSessions: jest.fn().mockResolvedValue([]),
  getGymDetailResult: jest.fn().mockResolvedValue(READ_FAILED),
  getGymsWithSessionsResult: jest.fn().mockResolvedValue({ ok: true, data: [] }),
}));

jest.mock("@jits/shared/types/composites", () => ({}), { virtual: true });
jest.mock("@jits/shared/types/session", () => ({}), { virtual: true });

import DashboardScreen from "@/app/(app)/(tabs)/(home)/index";

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
  queries.getGymDetailResult.mockResolvedValue(READ_FAILED);
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
    queries.getGymDetailResult.mockResolvedValue({ ok: true, data: mockGymDetail });

    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("discovery:g1:Test Gym:1:0:ok:retryable")).toBeTruthy();
    });
    expect(queries.getGymDetailResult).toHaveBeenCalledWith({}, "g1", mockAthlete.id);
    // Regression guard: the null-collapsing query must stay unused here. Going
    // back to it would restore the bug, and every assertion above would still
    // pass, because a healthy read looks identical through either one.
    expect(queries.getGymDetail).not.toHaveBeenCalled();
    // A member never pays for the gym-wide list; their own gym answers the question.
    expect(queries.getGymsWithSessions).not.toHaveBeenCalled();
    expect(queries.getGymsWithSessionsResult).not.toHaveBeenCalled();
  });

  it("feeds discovery the live-gym list for a free agent", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    queries.getGymsWithSessionsResult.mockResolvedValue({
      ok: true,
      data: [mockLiveGym],
    });

    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("discovery:free-agent:-:0:1:ok:retryable")).toBeTruthy();
    });
    expect(queries.getGymDetail).not.toHaveBeenCalled();
    expect(queries.getGymDetailResult).not.toHaveBeenCalled();
    expect(queries.getGymsWithSessions).not.toHaveBeenCalled();
  });

  /**
   * THE PRODUCTION FAILURE SHAPE IS A RESOLVED VALUE, NOT A REJECTION.
   *
   * A discovery read never rejects: postgrest-js defaults shouldThrowOnError to
   * false and converts even a hard fetch error into a resolved
   * { data: null, error } (PostgrestBuilder.ts:82, :372). A dropped connection,
   * an RLS denial, an expired JWT and a PostgREST 5xx all arrive as a resolved
   * { ok: false }. Mocking a rejection here would certify a path that cannot
   * occur in production, so these drive the real one: mockResolvedValue.
   */
  it("treats an unreadable primary gym as failed, not as an empty gym", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    mockAthlete.primary_gym_id = "g-unreadable";
    queries.getGymDetailResult.mockResolvedValue(READ_FAILED);

    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      // The dashboard still paints in full, and discovery is told it is blind
      // rather than being handed an empty list it would report as fact.
      expect(getByText("5W")).toBeTruthy();
    });
    expect(
      getByText("discovery:g-unreadable:-:0:0:failed:retryable"),
    ).toBeTruthy();
  });

  it("falls back to the last good gym payload when a refresh comes back empty", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    mockAthlete.primary_gym_id = "g1";
    queries.getGymDetailResult.mockResolvedValue({ ok: true, data: mockGymDetail });

    const { getByText, UNSAFE_getByType } = render(
      React.createElement(DashboardScreen),
    );
    await waitFor(() => {
      expect(getByText("discovery:g1:Test Gym:1:0:ok:retryable")).toBeTruthy();
    });

    // Same athlete, same gym, and the next read comes back unreadable. The
    // session that loaded a moment ago is still the best answer available, so
    // it must survive rather than be replaced by a null that reads as empty.
    queries.getGymDetailResult.mockResolvedValue(READ_FAILED);
    await act(async () => {
      UNSAFE_getByType(RefreshControl).props.onRefresh();
    });

    await waitFor(() => {
      expect(
        getByText("discovery:g1:Test Gym:1:0:failed:retryable"),
      ).toBeTruthy();
    });
  });

  // The belt-and-braces path: a genuine throw from inside the query function
  // (a JS error, not a failed request) is still possible and gets the same
  // treatment. This is a supplement to the resolved-null tests above, never a
  // substitute for them.
  it("also handles a thrown error from the gym read", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    // The screen logs the swallowed throw on purpose; keep it out of the test
    // output rather than leaving a red herring in the run.
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockAthlete.primary_gym_id = "g-broken";
    queries.getGymDetailResult.mockRejectedValue(new Error("boom"));

    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("5W")).toBeTruthy();
    });
    expect(
      getByText("discovery:g-broken:-:0:0:failed:retryable"),
    ).toBeTruthy();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  /**
   * THE HOLE THE MOBILE-SIDE WORKAROUND COULD NOT COVER (jits-icei.5).
   *
   * The previous version inferred failure from getGymDetail returning null,
   * which only happens when its FIRST read, the gym row, fails. When the gym
   * row loaded and the SESSIONS read then failed, the error was discarded, a
   * truthy detail came back with sessions: [], and this surface said "Nothing
   * scheduled at Test Gym right now" on a dropped request. getGymDetailResult
   * reports that case as { ok: false }, and the screen has to honour it: the
   * gym NAME is known, and the surface must still refuse to speak for it.
   */
  it("reports failure when the gym row loaded but its sessions did not", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    mockAthlete.primary_gym_id = "g1";
    // BOTH channels are mocked with what each would REALLY return in this one
    // scenario, which is what makes this a discriminating test rather than a
    // coincidence. Wired to the Result query the screen sees a failure; wired
    // to the old one it sees a healthy gym that simply has no sessions, and
    // reports "ok" with the gym name, which is the bug.
    queries.getGymDetailResult.mockResolvedValue(READ_FAILED);
    queries.getGymDetail.mockResolvedValue({ ...mockGymDetail, sessions: [] });

    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("5W")).toBeTruthy();
    });
    expect(getByText("discovery:g1:-:0:0:failed:retryable")).toBeTruthy();
  });

  /**
   * The free-agent branch had the same problem from the other side: because
   * getGymsWithSessions never rejected, its `failed` flag was always false, so
   * the error plate in session-discovery-section was unreachable in production.
   * This is the test that makes it live.
   */
  it("reports failure on the free-agent path instead of showing no live gyms", async () => {
    const queries = require("@jits/shared/api/queries") as QueryMocks;
    // Same construction as above: the Result query reports the failure, the
    // old one reports the empty list it always did, so only a screen reading
    // the Result can pass.
    queries.getGymsWithSessionsResult.mockResolvedValue(READ_FAILED);
    queries.getGymsWithSessions.mockResolvedValue([]);

    const { getByText } = render(React.createElement(DashboardScreen));
    await waitFor(() => {
      expect(getByText("5W")).toBeTruthy();
    });
    expect(getByText("discovery:free-agent:-:0:0:failed:retryable")).toBeTruthy();
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
