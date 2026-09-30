/**
 * Every match history row opens the match detail screen (jits-5tj9.8):
 * Stats full history and the athlete page head-to-head rows. (Home and
 * Profile rows are covered in dashboard.test.tsx and profile.test.tsx.)
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "opp-1" }),
}));
jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View, {});
  return new Proxy(
    {},
    { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : stub) },
  );
});
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({
    athlete: { id: "me-1", display_name: "Me", current_elo: 1200, current_weight: 180 },
    isLoading: false,
  }),
}));
function mockStub(testID: string) {
  const R = require("react");
  const RN = require("react-native");
  return () => R.createElement(RN.View, { testID });
}
jest.mock("@/components/layout/app-header", () => ({ AppHeader: mockStub("app-header") }));
jest.mock("@/components/profile/submission-breakdown", () => ({
  SubmissionBreakdownSection: mockStub("submissions"),
}));
jest.mock("@/components/profile/weekly-activity", () => ({
  WeeklyActivitySection: mockStub("weekly"),
}));
jest.mock("@/components/profile/elo-progression", () => ({
  EloProgressionChart: mockStub("elo-progression"),
}));
jest.mock("@/components/athlete/competitor-header", () => ({
  CompetitorHeader: mockStub("competitor-header"),
}));
jest.mock("@/components/athlete/head-to-head-card", () => ({
  HeadToHeadCard: mockStub("h2h-card"),
}));
jest.mock("@/components/compare-stats-modal", () => ({
  CompareStatsModal: mockStub("compare-modal"),
}));
jest.mock("@/lib/athlete/use-athlete-profile", () => ({
  useAthleteProfile: () => ({
    data: {
      competitor: { id: "opp-1", display_name: "Demo Red", current_elo: 1300, current_weight: 170 },
      competitorGymName: null,
      compStats: {},
      myStats: {},
      pendingChallengeId: null,
      headToHead: [],
    },
    isLoading: false,
    notFound: false,
  }),
}));

const HISTORY = [
  {
    match_id: "m-11",
    opponent_id: "opp-1",
    opponent_display_name: "Demo Red",
    athlete_outcome: "win",
    match_type: "ranked",
    elo_delta: 14,
    elo_before: 1200,
    elo_after: 1214,
    completed_at: "2026-09-24T12:00:00.000Z",
  },
  // A legacy casual row (written before casual was retired), in the shape the
  // backend really returns: match_participants.elo_delta is NOT NULL DEFAULT 0,
  // so the delta is 0 and only elo_after NULL says no rating was recorded.
  {
    match_id: "m-10",
    opponent_id: "opp-2",
    opponent_display_name: "Old Rival",
    athlete_outcome: "loss",
    match_type: "casual",
    elo_delta: 0,
    elo_before: null,
    elo_after: null,
    completed_at: "2026-09-20T12:00:00.000Z",
  },
];

jest.mock("@jits/shared/api/queries", () => ({
  getMatchHistory: jest.fn(async () => HISTORY),
  getEloHistory: jest.fn(async () => []),
  getSubmissionBreakdownRpc: jest.fn(async () => []),
}));

import ProfileStatsScreen from "@/app/(app)/(tabs)/profile/stats";
import AthleteProfileScreen from "@/app/(app)/athlete/[id]";
import { getMatchHistory } from "@jits/shared/api/queries";

beforeEach(() => mockPush.mockClear());

describe("match history rows open the match detail screen", () => {
  it("Stats full history", async () => {
    const { findByLabelText } = render(<ProfileStatsScreen />);
    fireEvent.press(await findByLabelText("Open match vs Demo Red"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/m-11");
  });

  it("athlete page head-to-head", async () => {
    const { findByLabelText } = render(<AthleteProfileScreen />);
    fireEvent.press(await findByLabelText("Open match vs Demo Red"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/m-11");
  });
});

describe("Stats: every match is ranked (jits-02vo.2)", () => {
  it("has no All/Ranked filter chips and counts the record over every completed match", async () => {
    const s = render(<ProfileStatsScreen />);
    await s.findByLabelText("Open match vs Old Rival");
    // The only "All" left is the timeline window chip (jits-02vo.4).
    expect(s.getAllByText("All")).toHaveLength(1);
    expect(s.getByLabelText("Show all time")).toBeTruthy();
    expect(s.queryByText("Ranked")).toBeNull();
    expect(s.getByText("1W")).toBeTruthy();
    expect(s.getByText("1L")).toBeTruthy();
    expect(s.getByText("50%")).toBeTruthy();
  });

  it("rows carry no ranked/casual suffix, and a legacy row with no delta shows none", async () => {
    const s = render(<ProfileStatsScreen />);
    await s.findByLabelText("Open match vs Old Rival");
    expect(s.queryByText(/casual/i)).toBeNull();
    expect(s.queryByText(/· Ranked/)).toBeNull();
    expect(s.getByText("+14")).toBeTruthy();
    expect(s.queryByText("null")).toBeNull();
    // The legacy row's elo_delta 0 must not read as a fake flat change.
    expect(s.queryByText("0")).toBeNull();
  });

  it("athlete page: a legacy row with elo_after NULL shows no delta (no flat 0)", async () => {
    // Head-to-head only lists matches vs opp-1, so serve one legacy row vs them.
    (getMatchHistory as jest.Mock).mockResolvedValueOnce([
      { ...HISTORY[1], match_id: "m-9", opponent_id: "opp-1", opponent_display_name: "Demo Red" },
    ]);
    const s = render(<AthleteProfileScreen />);
    await s.findByLabelText("Open match vs Demo Red");
    expect(s.queryByText("0")).toBeNull();
    expect(s.queryByText("—")).toBeNull();
  });
});
