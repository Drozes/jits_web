/**
 * Your numbers (jits-1ez5.2): the sheet the header rating opens. The rating
 * with the last match's delta, the sparkline, global rank of total with the
 * top %, the record, peak and this month; Unranked before a first match;
 * skeletons while the summary loads and an inline retry when it fails; no
 * streak anywhere; "View full stats" pushes Profile's stats.
 * Review fixes: a draw's delta is amber; a failed history read shows an
 * unavailable state (never a fabricated 0); the sheet scrolls under a capped
 * height; the chart's label reaches VoiceOver; closing unmounts.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

let mockSheetProps: Record<string, unknown> = {};
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    BottomSheetModal: R.forwardRef((props: { children: React.ReactNode }, ref: unknown) => {
      R.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: mockDismiss }));
      mockSheetProps = props;
      return R.createElement(RN.View, {}, props.children);
    }),
    BottomSheetScrollView: (props: { children: React.ReactNode }) => R.createElement(RN.View, { testID: "sheet-scroll" }, props.children),
    BottomSheetBackdrop: () => null,
  };
});
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }));
const mockPresent = jest.fn();
const mockDismiss = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "dark",
  useThemedTokens: () => ({ textPrimary: "#fff", textTertiary: "#999", borderHairlineStrong: "#333", bgSecondary: "#111", borderHairline: "#222" }),
}));
const P = require("@/lib/theme/palette").paletteFor("dark");

type Summary = Record<string, unknown> | null;
let mockDashboard: { data: { summary: Summary } | undefined; isLoading: boolean; refresh: jest.Mock };
const mockUseDashboard = jest.fn();
jest.mock("@/lib/dashboard/use-dashboard-summary", () => ({
  useDashboardSummary: (...a: unknown[]) => {
    mockUseDashboard(...a);
    return mockDashboard;
  },
}));
const mockUseProfile = jest.fn();
jest.mock("@/lib/profile/use-profile-data", () => ({
  useProfileData: (...a: unknown[]) => mockUseProfile(...a),
}));
let mockHistory: { data: unknown[] | undefined; isLoading: boolean; error: Error | null } = { data: [], isLoading: false, error: null };
jest.mock("@/lib/cache/use-cached-resource", () => ({
  useCachedResource: () => mockHistory,
}));

import { StyleSheet } from "react-native";
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

/** Newest first, as the RPC returns it; the first two rows fall in this month. */
function history(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => ({
    match_id: `m${i}`,
    rating_before: 1500 - i,
    rating_after: 1501 - i,
    delta: i < 2 ? 19 : 1,
    created_at: (i < 2 ? new Date(now.getFullYear(), now.getMonth(), 1, 12) : new Date(now.getFullYear(), now.getMonth() - 1, 1)).toISOString(),
  }));
}

const color = (el: { props: { style?: unknown } }) => (StyleSheet.flatten(el.props.style as never) as { color?: string }).color;

beforeEach(() => {
  jest.clearAllMocks();
  mockDashboard = { data: { summary: SUMMARY }, isLoading: false, refresh: jest.fn() };
  mockHistory = { data: history(21), isLoading: false, error: null };
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
    expect(utils.getByText("▲ +38")).toBeTruthy(); // this month: two +19 rows
    expect(utils.getByTestId("your-numbers-sparkline")).toBeTruthy();
    // No streak anywhere (owner decision).
    expect(utils.queryByText(/streak/i)).toBeNull();
  });

  it("shares Home's dashboard entry quietly and sums this month from the rating history (no match-history read)", () => {
    render(<YourNumbersBody athlete={ATHLETE} />);
    expect(mockUseDashboard).toHaveBeenCalledWith("a1", { quiet: true });
    expect(mockUseProfile).not.toHaveBeenCalled();
  });

  it("a loss this month is a down delta with a real minus", () => {
    // This month: +1 and -6.
    const rows = history(21);
    rows[0] = { ...rows[0], delta: 1 };
    rows[1] = { ...rows[1], delta: -6 };
    mockHistory = { data: rows, isLoading: false, error: null };
    const utils = render(<YourNumbersBody athlete={ATHLETE} />);
    expect(utils.getByText("▼ \u22125")).toBeTruthy();
  });

  it("colors a draw's last-match delta amber, never red (review C1)", () => {
    mockDashboard.data = {
      summary: { ...SUMMARY, recent_matches: [{ ...SUMMARY.recent_matches[0], outcome: "draw", elo_delta: -2 }] },
    };
    const utils = render(<YourNumbersBody athlete={ATHLETE} />);
    const delta = utils.getByTestId("your-numbers-last-delta");
    expect(delta).toHaveTextContent("▼ \u22122");
    expect(color(delta)).toBe(P.amber);
    expect(color(delta)).not.toBe(P.loss);
  });

  it("a loss's last-match delta is red (negative), a win's green", () => {
    mockDashboard.data = { summary: { ...SUMMARY, recent_matches: [{ ...SUMMARY.recent_matches[0], outcome: "loss", elo_delta: -11 }] } };
    expect(color(render(<YourNumbersBody athlete={ATHLETE} />).getByTestId("your-numbers-last-delta"))).toBe(P.loss);
    mockDashboard.data = { summary: SUMMARY };
    expect(color(render(<YourNumbersBody athlete={ATHLETE} />).getByTestId("your-numbers-last-delta"))).toBe(P.win);
  });

  it("a failed history read shows an unavailable chart and month, never a fabricated 0 (review C5)", () => {
    mockHistory = { data: undefined, isLoading: false, error: new Error("boom") };
    const utils = render(<YourNumbersBody athlete={ATHLETE} />);
    expect(utils.getByTestId("your-numbers-history-unavailable")).toBeTruthy();
    expect(utils.getByTestId("your-numbers-month-unavailable")).toHaveTextContent("Unavailable");
    expect(utils.getByTestId("your-numbers-month")).toHaveProp("accessibilityLabel", "This month: unavailable");
    expect(utils.queryByTestId("your-numbers-sparkline")).toBeNull();
  });

  it("no history rows for an athlete with matches is a failed read too (the wrapper swallows errors)", () => {
    mockHistory = { data: [], isLoading: false, error: null };
    const utils = render(<YourNumbersBody athlete={ATHLETE} />);
    expect(utils.getByTestId("your-numbers-history-unavailable")).toBeTruthy();
    expect(utils.queryByText("0")).toBeNull();
  });

  it("skeletons the chart and the month while the history loads", () => {
    mockHistory = { data: undefined, isLoading: true, error: null };
    const utils = render(<YourNumbersBody athlete={ATHLETE} />);
    expect(utils.getByTestId("your-numbers-month")).toHaveProp("accessibilityLabel", "This month: loading");
    expect(utils.queryByTestId("your-numbers-history-unavailable")).toBeNull();
  });

  it("the chart's label reaches VoiceOver on an accessible wrapper, and the legend names the peak (review D4, D5)", () => {
    const utils = render(<YourNumbersBody athlete={ATHLETE} />);
    const chart = utils.getByTestId("your-numbers-sparkline-chart");
    expect(chart.props.accessible).toBe(true);
    expect(chart.props.accessibilityRole).toBe("image");
    expect(chart.props.accessibilityLabel).toMatch(/^Rating over your last 20 matches, from \d+ to 1512\. Peak 1540$/);
  });

  it("reads Unranked before a first match, with no chart and no last-match delta", () => {
    mockDashboard.data = {
      summary: { ...SUMMARY, stats: { ...SUMMARY.stats, wins: 0, losses: 0, draws: 0, total_matches: 0 }, rank: { current: 412, best: 412, total: 412 }, recent_matches: [] },
    };
    mockHistory = { data: [], isLoading: false, error: null };
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

  it("caps its height below the top safe area and scrolls its content (review D1)", () => {
    render(<YourNumbersSheet athlete={ATHLETE} open onClosed={jest.fn()} />);
    expect(mockSheetProps.topInset).toBe(59);
    expect(mockSheetProps.maxDynamicContentSize).toBeLessThanOrEqual(1334 - 59);
    expect(mockSheetProps.enableDynamicSizing).toBe(true);
  });

  it("reports closed when gorhom closes it (index -1), and only dismisses a sheet it presented", () => {
    const onClosed = jest.fn();
    const utils = render(<YourNumbersSheet athlete={ATHLETE} open onClosed={onClosed} />);
    act(() => (mockSheetProps.onChange as (i: number) => void)(0));
    expect(onClosed).not.toHaveBeenCalled();
    act(() => (mockSheetProps.onChange as (i: number) => void)(-1));
    expect(onClosed).toHaveBeenCalledTimes(1);
    // Closed itself: a later open=false must not dismiss again (gorhom DISMISSING).
    utils.rerender(<YourNumbersSheet athlete={ATHLETE} open={false} onClosed={onClosed} />);
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it("open -> false dismisses a sheet it presented (the tab lost focus)", () => {
    const utils = render(<YourNumbersSheet athlete={ATHLETE} open onClosed={jest.fn()} />);
    utils.rerender(<YourNumbersSheet athlete={ATHLETE} open={false} onClosed={jest.fn()} />);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });
});
