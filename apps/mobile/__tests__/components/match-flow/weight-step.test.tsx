/**
 * Weight step "At stake" preview and weight-gap note (jits-48a6).
 *
 * - Ranked: one `getEloStakes` read with the VIEWER as challenger, rendered
 *   as Win (green) / Draw (amber) / Loss (red) in mono.
 * - Null, a throw, casual, or a missing rating: no row, no spinner, no error.
 * - A division gap is a default plate with amber copy, not a red loss plate.
 */
import * as React from "react";
import { render, act, waitFor } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = (props: { color?: string }) => R.createElement(RN.View, { testID: "icon", color: props.color });
  return new Proxy(
    {},
    { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) },
  );
});

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2", textSecondary: "#9AA3AD" }),
  useResolvedColorScheme: () => "light",
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

jest.mock("@/lib/match-flow/match-sync-context", () => ({
  useStepMatchSync: jest.fn(() => ({})),
}));

const mockGetEloStakes = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getEloStakes: (...args: unknown[]) => mockGetEloStakes(...args),
}));

jest.mock("@/components/ui/elo-system", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    EloTile: () => R.createElement(RN.View, { testID: "elo-tile" }),
    Plate: ({ children, variant, testID }: { children: React.ReactNode; variant?: string; testID?: string }) =>
      R.createElement(RN.View, { testID, variant }, children),
  };
});

import { WeightStep } from "@/components/match-flow/steps/weight-step";

const STAKES = {
  challenger_win: 16,
  challenger_loss: -16,
  challenger_draw: -8,
  opponent_win: 16,
  opponent_loss: -16,
  opponent_draw: -8,
  challenger_expected: 0.5,
  opponent_expected: 0.5,
  weight_division_gap: 0,
  draw_score: 0.25,
};

type Props = React.ComponentProps<typeof WeightStep>;

function renderWeight(overrides: Partial<Props> = {}) {
  const props: Props = {
    matchId: "M1",
    onCancelledRemotely: jest.fn(),
    currentDisplayName: "Demo Blue",
    currentWeight: 170,
    currentElo: 1000,
    opponentDisplayName: "Demo Red",
    opponentWeight: 172,
    opponentElo: 1040,
    matchType: "ranked",
    onConfirm: jest.fn(),
    ...overrides,
  };
  return render(<WeightStep {...props} />);
}

beforeEach(() => {
  mockGetEloStakes.mockReset();
});

describe("At stake row", () => {
  it("reads the stakes once with the viewer as challenger and renders Win / Draw / Loss", async () => {
    mockGetEloStakes.mockResolvedValue(STAKES);
    const s = renderWeight();
    await waitFor(() => s.getByTestId("weight-stakes"));
    expect(mockGetEloStakes).toHaveBeenCalledTimes(1);
    expect(mockGetEloStakes).toHaveBeenCalledWith({ tag: "client" }, 1000, 1040, 170, 172);

    const win = s.getByTestId("weight-stakes-win");
    const draw = s.getByTestId("weight-stakes-draw");
    const loss = s.getByTestId("weight-stakes-loss");
    expect(win.props.children).toBe("+16");
    expect(draw.props.children).toBe("-8");
    expect(loss.props.children).toBe("-16");
    expect(win.props.className).toContain("text-positive");
    expect(draw.props.className).toContain("text-amber-600");
    expect(loss.props.className).toContain("text-negative");
    for (const el of [win, draw, loss]) {
      expect(el.props.className).toContain("font-mono-bold");
      expect(el.props.className).toContain("tabular-nums");
    }
    expect(s.getByText("At stake")).toBeTruthy();
  });

  it("hides the row when the RPC returns null", async () => {
    mockGetEloStakes.mockResolvedValue(null);
    const s = renderWeight();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGetEloStakes).toHaveBeenCalled();
    expect(s.queryByTestId("weight-stakes")).toBeNull();
    s.getByTestId("weight-confirm");
  });

  it("hides the row when the read throws", async () => {
    mockGetEloStakes.mockRejectedValue(new Error("offline"));
    const s = renderWeight();
    await act(async () => {
      await Promise.resolve();
    });
    expect(s.queryByTestId("weight-stakes")).toBeNull();
    s.getByTestId("weight-confirm");
  });

  it("never reads stakes for a casual match", async () => {
    const s = renderWeight({ matchType: "casual" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGetEloStakes).not.toHaveBeenCalled();
    expect(s.queryByTestId("weight-stakes")).toBeNull();
  });

  it("does not read stakes without both ratings", async () => {
    renderWeight({ opponentElo: null });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGetEloStakes).not.toHaveBeenCalled();
  });
});

describe("weight gap note", () => {
  it("is a default plate with an amber icon and plain copy, not a red loss plate", async () => {
    mockGetEloStakes.mockResolvedValue({ ...STAKES, weight_division_gap: 2 });
    const s = renderWeight({ currentWeight: 150, opponentWeight: 180 });
    await waitFor(() => s.getByTestId("weight-stakes"));
    const note = s.getByTestId("weight-gap-note");
    expect(note.props.variant).toBeUndefined();
    const icon = s.getAllByTestId("icon").find((i) => i.props.color);
    expect(icon?.props.color).toBe("#d97706");
    expect(s.getByText(/classes apart\. The heavier athlete’s rating is adjusted\./)).toBeTruthy();
  });

  it("uses the backend's division gap once the stakes land", async () => {
    // 11 lbs apart estimates one class locally, but the RPC says none.
    mockGetEloStakes.mockResolvedValue({ ...STAKES, weight_division_gap: 0 });
    const s = renderWeight({ currentWeight: 160, opponentWeight: 171 });
    await waitFor(() => s.getByTestId("weight-stakes"));
    expect(s.queryByTestId("weight-gap-note")).toBeNull();
  });
});
