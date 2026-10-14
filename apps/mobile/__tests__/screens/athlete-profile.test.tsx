/**
 * Another athlete's profile has no Challenge button (jits-qwn5).
 *
 * It rendered a big, disabled Signal Red "Challenge" that toasted "coming
 * soon", which read as broken. Challenges happen in the Arena.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";

let mockId = "rival-1";
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: mockId }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View);
  return new Proxy({}, { get: (_t, p) => (p === "__esModule" ? true : stub) });
});

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ accentCta: "#E63946", textOnAccent: "#fff", textPrimary: "#fff", textSecondary: "#aaa" }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@jits/shared/api/queries", () => ({
  getMatchHistory: jest.fn(() => Promise.resolve([])),
}));
jest.mock("@/components/ui", () => ({ toast: { info: jest.fn(), error: jest.fn() } }));
jest.mock("@/components/layout/app-header", () => ({
  AppHeader: ({ rightAction }: { rightAction?: React.ReactNode }) => rightAction ?? null,
}));
jest.mock("@/components/moderation/athlete-moderation-sheet", () => ({
  AthleteModerationSheet: ({ mode }: { mode: string | null }) => {
    const RN = require("react-native");
    return mode ? <RN.Text testID="moderation-sheet">{mode}</RN.Text> : null;
  },
}));
jest.mock("@/components/athlete/competitor-header", () => ({ CompetitorHeader: () => null }));
jest.mock("@/components/athlete/head-to-head-card", () => ({ HeadToHeadCard: () => null }));
jest.mock("@/components/compare-stats-modal", () => ({ CompareStatsModal: () => null }));

jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({
    athlete: { id: "me-1", display_name: "Me", current_elo: 1200, current_weight: 180 },
    isLoading: false,
  }),
}));

const STATS = { wins: 1, losses: 0, draws: 0 };
jest.mock("@/lib/athlete/use-athlete-profile", () => ({
  useAthleteProfile: () => ({
    data: {
      competitor: { id: "rival-1", display_name: "Rival", current_elo: 1300, current_weight: 190 },
      competitorGymName: null,
      compStats: STATS,
      myStats: STATS,
      pendingChallengeId: null,
      headToHead: [],
    },
    isLoading: false,
    notFound: false,
  }),
}));

import AthleteProfileScreen from "@/app/(app)/athlete/[id]";
import { fireEvent } from "@testing-library/react-native";
import { __resetBlocksForTests } from "@/lib/moderation/block-store";

beforeEach(() => {
  mockId = "rival-1";
  __resetBlocksForTests({ athleteId: "me-1", loaded: true });
});

describe("AthleteProfileScreen", () => {
  it("renders no Challenge button, and keeps Compare Stats", async () => {
    const { queryByText, getByText } = render(<AthleteProfileScreen />);
    await act(async () => {}); // settle the recent-matches read
    expect(queryByText(/^Challenge$/i)).toBeNull();
    expect(getByText("Compare Stats")).toBeTruthy();
  });

  it("offers More (report and block) on another athlete's profile", async () => {
    const s = render(<AthleteProfileScreen />);
    await act(async () => {});
    fireEvent.press(s.getByTestId("athlete-more"));
    expect(s.getByTestId("moderation-sheet").props.children).toBe("menu");
  });

  it("never offers report or block on your own profile", async () => {
    mockId = "me-1";
    const s = render(<AthleteProfileScreen />);
    await act(async () => {});
    expect(s.queryByTestId("athlete-more")).toBeNull();
  });

  it("someone I blocked (a deep link too): the blocked state with Unblock, no stats or compare", async () => {
    __resetBlocksForTests({ athleteId: "me-1", loaded: true, ids: new Set(["rival-1"]), mine: new Set(["rival-1"]) });
    const s = render(<AthleteProfileScreen />);
    await act(async () => {});
    expect(s.getByTestId("athlete-blocked-state")).toBeTruthy();
    expect(s.getByTestId("athlete-unblock")).toBeTruthy();
    expect(s.queryByText("Compare Stats")).toBeNull();
  });

  it("someone who blocked me: not available, no Unblock", async () => {
    __resetBlocksForTests({ athleteId: "me-1", loaded: true, ids: new Set(["rival-1"]) });
    const s = render(<AthleteProfileScreen />);
    await act(async () => {});
    expect(s.getByText("You can't see this athlete's profile.")).toBeTruthy();
    expect(s.queryByTestId("athlete-unblock")).toBeNull();
    expect(s.queryByText("Compare Stats")).toBeNull();
  });
});
