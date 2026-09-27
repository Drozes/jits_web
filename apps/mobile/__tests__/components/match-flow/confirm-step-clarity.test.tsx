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
const mockDispute = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  confirmMatchResult: (...a: unknown[]) => mockConfirm(...a),
  disputeMatchResult: (...a: unknown[]) => mockDispute(...a),
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

type StepProps = React.ComponentProps<typeof ConfirmStep>;

function renderStep(matchType: "ranked" | "casual" = "ranked", overrides: Partial<StepProps> = {}) {
  return render(
    <ConfirmStep
      matchId="M1"
      matchType={matchType}
      me={{ athlete_id: "me-1", display_name: "Mina Park", elo_before: 1498, elo_after: 1489, elo_delta: -9 }}
      opponent={{ athlete_id: "opp-1", display_name: "Demo Red" }}
      resultData={{ result: "submission", winnerId: "me-1" }}
      confirmedAthleteIds={[]}
      submissionName={null}
      finishTimeSeconds={null}
      disputeLocksAt={null}
      onCompleted={jest.fn()}
      {...overrides}
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

  it("subtitle override replaces the default line (practice has no dispute)", () => {
    const { getByText, queryByText } = render(
      <ResultBanner
        resultData={null}
        currentAthleteId="me-1"
        matchType="casual"
        subtitle="Confirm if this is right."
      />,
    );
    getByText("Confirm if this is right.");
    expect(queryByText(/dispute/i)).toBeNull();
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

describe("ConfirmStep (opponent view, match-flow redesign)", () => {
  it("shows who won, how, and the viewer's rating move; keeps the harness verdict", () => {
    const s = renderStep("ranked", {
      resultData: { result: "submission", winnerId: "opp-1" },
      submissionName: "Rear-naked choke",
      finishTimeSeconds: 377,
    });
    s.getByText("D. Red won");
    s.getByText("by Rear-naked choke \u00b7 06:17");
    expect(s.getByTestId("confirm-verdict")).toHaveTextContent("YOU LOST");
    s.getByText("1498 \u2192 1489");
    s.getByText("\u25bc \u22129");
    // The heading and the red CTA both say it.
    expect(s.getAllByText("Confirm result")).toHaveLength(2);
  });

  it("the recorder is shown already confirmed (auto-confirmed server-side)", () => {
    const s = renderStep("ranked", { confirmedAthleteIds: ["opp-1"] });
    s.getByText("RESULT RECORDED BY D. RED");
    s.getByTestId("confirm-panel-opponent-confirmed");
    s.getByText("D. RED CONFIRMED \u2713");
    s.getByText("WAITING ON YOU");
  });

  it("dispute is a full-size secondary button with the 24 h lock note", () => {
    const locks = new Date(Date.now() + 23.5 * 3_600_000).toISOString();
    const s = renderStep("ranked", { disputeLocksAt: locks });
    expect(s.getByTestId("confirm-dispute")).toBeTruthy();
    s.getByText("Dispute result");
    s.getByText("Locks automatically in 23 h if nobody disputes.");
  });

  it("hides dispute once the window has closed", () => {
    const s = renderStep("ranked", { disputeLocksAt: new Date(Date.now() - 1000).toISOString() });
    expect(s.queryByTestId("confirm-dispute")).toBeNull();
    s.getByText("The dispute window has closed.");
  });

  it("a dispute refused with dispute_window_closed closes the form and hides dispute", async () => {
    mockDispute.mockResolvedValue({ ok: false, error: { code: "DISPUTE_WINDOW_CLOSED", message: "Results lock 24 hours after the match." } });
    const s = renderStep();
    fireEvent.press(s.getByTestId("confirm-dispute"));
    await act(async () => {
      fireEvent.press(s.getByTestId("dispute-submit"));
    });
    expect(s.queryByTestId("dispute-submit")).toBeNull();
    expect(s.queryByTestId("confirm-dispute")).toBeNull();
    s.getByTestId("confirm-result");
  });

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
