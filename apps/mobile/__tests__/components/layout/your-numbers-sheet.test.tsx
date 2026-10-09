/**
 * Your numbers (jits-1ez5.2): the sheet the header rating opens. The rating
 * with the last match's delta, the sparkline, global rank of total with the
 * top %, the record, peak and this month; Unranked before a first match;
 * skeletons while the summary loads and an inline retry when it fails; no
 * streak anywhere; "View full stats" pushes Profile's stats.
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    BottomSheetModal: R.forwardRef((props: { children: React.ReactNode }, ref: unknown) => {
      R.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: mockDismiss }));
      return R.createElement(RN.View, {}, props.children);
    }),
    BottomSheetView: (props: { children: React.ReactNode }) => R.createElement(RN.View, {}, props.children),
    BottomSheetBackdrop: () => null,
  };
});
const mockPresent = jest.fn();
const mockDismiss = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "dark",
  useThemedTokens: () => ({ textPrimary: "#fff", textTertiary: "#999", borderHairlineStrong: "#333", bgSecondary: "#111", borderHairline: "#222" }),
}));

type Summary = Record<string, unknown> | null;
let mockDashboard: { data: { summary: Summary } | undefined; isLoading: boolean; refresh: jest.Mock };
const mockUseDashboard = jest.fn();
jest.mock("@/lib/dashboard/use-dashboard-summary", () => ({
  useDashboardSummary: (...a: unknown[]) => {
    mockUseDashboard(...a);
    return mockDashboard;
  },
}));
let mockProfile = { eloThisMonth: 38, isLoading: false };
const mockUseProfile = jest.fn();
jest.mock("@/lib/profile/use-profile-data", () => ({
  useProfileData: (...a: unknown[]) => {
    mockUseProfile(...a);
    return mockProfile;
  },
}));
let mockHistory: { data: unknown[] | undefined; isLoading: boolean } = { data: [], isLoading: false };
jest.mock("@/lib/cache/use-cached-resource", () => ({
  useCachedResource: () => mockHistory,
}));

import { YourNumbersBody, YourNumbersSheet } from "@/components/layout/your-numbers-sheet";

const ATHLETE = {
  id: "a1",
  current_elo: 1512,
  highest_elo: 1540,
  primary_gym_id: "g1",
} as never;

const SUMMARY = {
  stats: { wins: 14, losses: 6, draws: 1, win_streak: 4, best_win_streak: 6, total_matches: 21 },
  rank: { current: 37, best: 20, total: 412 },
  recent_matches: [
    { match_id: "m1", opponent_name: "Marco", outcome: "win", match_type: "ranked", elo_delta: 14, completed_at: "2026-10-08T12:00:00Z" },
  ],
  recent_activity: [],
};

function history(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    match_id: `m${i}`,
    rating_before: 1500 - i,
    rating_after: 1501 - i,
    delta: 1,
    created_at: new Date(Date.UTC(2026, 9, 8 - i)).toISOString(),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDashboard = { data: { summary: SUMMARY }, isLoading: false, refresh: jest.fn() };
  mockProfile = { eloThisMonth: 38, isLoading: false };
  mockHistory = { data: history(21), isLoading: false };
});

describe("YourNumbersBody", () => {
  it("shows the rating, the last match's delta, rank of total with the top %, record, peak and this month", () => {
    const utils = render(<YourNumbersBody athlete={ATHLETE} />);
    expect(utils.getByText("1512")).toBeTruthy();
    expect(utils.getByTestId("your-numbers-last-delta")).toHaveTextContent("▲ +14");
    expect(utils.getByTestId("your-numbers-rank")).toHaveProp("accessibilityLabel", "Global rank 37 of 412, top 9 percent");
    expect(utils.getByText("Top 9%")).toBeTruthy();
    expect(utils.getByText("14W · 6L · 1D")).toBeTruthy();
    expect(utils.getByText("21 matches")).toBeTruthy();
    expect(utils.getByText("1540")).toBeTruthy();
    expect(utils.getByText("28 above now")).toBeTruthy();
    expect(utils.getByText("▲ +38")).toBeTruthy();
    expect(utils.getByTestId("your-numbers-sparkline")).toBeTruthy();
    // No streak anywhere (owner decision).
    expect(utils.queryByText(/streak/i)).toBeNull();
  });

  it("shares Home's dashboard entry quietly and reads this month from the profile query", () => {
    render(<YourNumbersBody athlete={ATHLETE} />);
    expect(mockUseDashboard).toHaveBeenCalledWith("a1", { quiet: true });
    expect(mockUseProfile).toHaveBeenCalledWith("a1", "g1", { quiet: true });
  });

  it("a loss this month is a down delta with a real minus", () => {
    mockProfile = { eloThisMonth: -11, isLoading: false };
    const utils = render(<YourNumbersBody athlete={ATHLETE} />);
    expect(utils.getByText("▼ −11")).toBeTruthy();
  });

  it("reads Unranked before a first match, with no chart and no last-match delta", () => {
    mockDashboard.data = {
      summary: { ...SUMMARY, stats: { ...SUMMARY.stats, wins: 0, losses: 0, draws: 0, total_matches: 0 }, rank: { current: 412, best: 412, total: 412 }, recent_matches: [] },
    };
    mockHistory = { data: [], isLoading: false };
    const utils = render(<YourNumbersBody athlete={{ ...(ATHLETE as object), current_elo: 1200, highest_elo: 1200 } as never} />);
    expect(utils.getByText("Unranked")).toBeTruthy();
    expect(utils.queryByText(/#412/)).toBeNull();
    expect(utils.getByTestId("your-numbers-first-match")).toHaveTextContent("Your first match sets your rank.");
    expect(utils.queryByTestId("your-numbers-sparkline")).toBeNull();
    expect(utils.queryByTestId("your-numbers-last-delta")).toBeNull();
    expect(utils.getByText("At your peak")).toBeTruthy();
  });

  it("shows skeleton cells while the summary loads cold", () => {
    mockDashboard = { data: undefined, isLoading: true, refresh: jest.fn() };
    const utils = render(<YourNumbersBody athlete={ATHLETE} />);
    expect(utils.getByTestId("your-numbers-loading")).toBeTruthy();
    // The rating is the athlete's: it never waits.
    expect(utils.getByText("1512")).toBeTruthy();
  });

  it("offers a retry when the summary failed", () => {
    mockDashboard = { data: undefined, isLoading: false, refresh: jest.fn() };
    const utils = render(<YourNumbersBody athlete={ATHLETE} />);
    expect(utils.getByTestId("your-numbers-error")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Try again"));
    expect(mockDashboard.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("YourNumbersSheet", () => {
  it("presents on open and View full stats closes it and pushes Profile's stats", () => {
    const onClosed = jest.fn();
    const utils = render(<YourNumbersSheet athlete={ATHLETE} open onClosed={onClosed} />);
    expect(mockPresent).toHaveBeenCalledTimes(1);
    expect(utils.getByRole("header")).toHaveTextContent("Your numbers");
    fireEvent.press(utils.getByLabelText("View full stats"));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/(app)/profile/stats");
  });
});
