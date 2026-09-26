/**
 * Another athlete's profile has no Challenge button (jits-qwn5).
 *
 * It rendered a big, disabled Signal Red "Challenge" that toasted "coming
 * soon", which read as broken. Challenges happen in the Arena.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "rival-1" }),
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
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
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

describe("AthleteProfileScreen", () => {
  it("renders no Challenge button, and keeps Compare Stats", async () => {
    const { queryByText, getByText } = render(<AthleteProfileScreen />);
    await act(async () => {}); // settle the recent-matches read
    expect(queryByText(/^Challenge$/i)).toBeNull();
    expect(getByText("Compare Stats")).toBeTruthy();
  });
});
