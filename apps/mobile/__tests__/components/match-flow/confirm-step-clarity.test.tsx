/**
 * Confirm step clarity (jits-g2zv, UX-07) and its haptics (jits-4zp.7).
 *
 * - The subtitle is plain English, not "RANKED. ELO ALREADY APPLIED...".
 * - The viewer's own pending panel reads "Your call" with an empty circle,
 *   not the spinner the opponent's pending panel keeps ("Confirming...").
 * - After confirming, the wait line names the opponent.
 * - A successful confirm gives a light impact; a failed one the error buzz.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { ActivityIndicator } from "react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textSecondary: "#aaa", statePositive: "#0f0", textOnAccent: "#000" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) },
  );
});

const mockImpact = jest.fn((_s: unknown) => Promise.resolve());
jest.mock("expo-haptics", () => ({
  impactAsync: (s: unknown) => mockImpact(s),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));
const mockHapticError = jest.fn(() => Promise.resolve());
jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: { error: () => mockHapticError(), resultRecorded: jest.fn() },
}));

const mockConfirm = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  confirmMatchResult: (...a: unknown[]) => mockConfirm(...a),
  disputeMatchResult: jest.fn(),
}));
jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: { enqueue: (_k: string, fn: () => unknown) => fn() },
  isQueuedResult: () => false,
}));
jest.mock("@/lib/match-flow/match-sync-context", () => ({
  SEND_GRACE_MS: 1_500,
  useMatchSyncContext: () => ({ reconcileNow: jest.fn() }),
  useStepMatchSync: () => ({
    broadcastResultConfirmed: jest.fn(() => Promise.resolve()),
    broadcastMatchDisputed: jest.fn(() => Promise.resolve()),
  }),
}));

import { ConfirmStep } from "@/components/match-flow/steps/confirm-step";
import { ConfirmPanel, ResultBanner } from "@/components/match-flow/steps/confirm-step-panels";

function renderStep(matchType: "ranked" | "casual" = "ranked") {
  return render(
    <ConfirmStep
      matchId="M1"
      matchType={matchType}
      currentAthleteId="me-1"
      opponentId="opp-1"
      opponentDisplayName="Demo Red"
      resultData={{ result: "submission", winnerId: "me-1" }}
      confirmedAthleteIds={[]}
      onCompleted={jest.fn()}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue({ ok: true, data: {} });
});

describe("ResultBanner subtitle", () => {
  it("ranked: says the rating is already updated and what to do", () => {
    const { getByText, queryByText } = render(
      <ResultBanner resultData={null} currentAthleteId="me-1" matchType="ranked" />,
    );
    getByText(
      "Your rating is already updated. Confirm if this is right, or dispute it and an admin will review.",
    );
    expect(queryByText(/ELO already applied/i)).toBeNull();
  });

  it("casual: short confirm-or-dispute line", () => {
    const { getByText } = render(
      <ResultBanner resultData={null} currentAthleteId="me-1" matchType="casual" />,
    );
    getByText("Confirm if this is right, or dispute it.");
  });

  it("keeps the harness verdict and testID", () => {
    const { getByTestId } = render(
      <ResultBanner
        resultData={{ result: "draw" }}
        currentAthleteId="me-1"
        matchType="ranked"
      />,
    );
    expect(getByTestId("confirm-verdict").props.children).toBe("DRAW");
  });
});

describe("ConfirmPanel states", () => {
  it("your-call: empty circle and 'Your call', no spinner", () => {
    const { getByText, UNSAFE_queryAllByType } = render(
      <ConfirmPanel label="You" side="you" state="your-call" />,
    );
    getByText("Your call");
    expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it("confirming: spinner and 'Confirming...'", () => {
    const { getByText, UNSAFE_queryAllByType } = render(
      <ConfirmPanel label="Demo Red" side="opponent" state="confirming" />,
    );
    getByText("Confirming...");
    expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(1);
  });

  it("confirmed: check, no spinner", () => {
    const { getByText, UNSAFE_queryAllByType } = render(
      <ConfirmPanel label="You" side="you" state="confirmed" />,
    );
    getByText("Confirmed");
    expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
  });
});

describe("ConfirmStep", () => {
  it("before acting: 'Your call' for the viewer, 'Confirming...' for the opponent", () => {
    const { getByTestId } = renderStep();
    getByTestId("confirm-panel-you-your-call");
    getByTestId("confirm-panel-opponent-confirming");
    getByTestId("confirm-result");
    getByTestId("confirm-dispute");
  });

  it("after confirming: names the opponent and gives a light impact", async () => {
    const { getByTestId, getByText } = renderStep();
    await act(async () => {
      fireEvent.press(getByTestId("confirm-result"));
    });
    getByText("Waiting for Demo Red to confirm...");
    getByTestId("confirm-panel-you-confirmed");
    getByTestId("confirm-panel-opponent-confirming");
    expect(mockImpact).toHaveBeenCalledWith("light");
    expect(mockHapticError).not.toHaveBeenCalled();
  });

  it("a failed confirm buzzes the error haptic and no success impact", async () => {
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "nope" } });
    const { getByTestId } = renderStep();
    await act(async () => {
      fireEvent.press(getByTestId("confirm-result"));
    });
    expect(mockHapticError).toHaveBeenCalledTimes(1);
    expect(mockImpact).not.toHaveBeenCalled();
    // Back to the viewer's turn.
    getByTestId("confirm-panel-you-your-call");
  });
});
