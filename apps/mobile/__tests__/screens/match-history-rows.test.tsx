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
jest.mock("@/components/profile/milestone-progress", () => ({
  MilestoneProgress: mockStub("milestone"),
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
    completed_at: "2026-09-24T12:00:00.000Z",
  },
];

jest.mock("@jits/shared/api/queries", () => ({
  getMatchHistory: jest.fn(async () => HISTORY),
  getEloHistory: jest.fn(async () => []),
  getWeeklyMatchActivity: jest.fn(async () => []),
  getSubmissionBreakdown: jest.fn(async () => []),
}));

import ProfileStatsScreen from "@/app/(app)/(tabs)/profile/stats";
import AthleteProfileScreen from "@/app/(app)/athlete/[id]";

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
