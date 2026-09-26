/**
 * Result, End and Dispute step colour and copy (jits-feq5 UX-11,
 * jits-sdh3 UX-12), plus the dispute failure haptic (jits-4zp.7).
 *
 * - Draw: default plate (not the red loss plate), amber handshake, honest copy.
 * - End: default plate (not the green win plate), ink check, "Up next".
 * - Dispute: explains admin review, ratings unchanged until then, amber glyph.
 * - Harness headings/testIDs stay: "Record result", result-record,
 *   "Dispute result", dispute-reason, dispute-submit.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
const TOKENS = {
  textPrimary: "#E8EDF2",
  textSecondary: "#9CA3AF",
  textTertiary: "#8D929D",
  textOnAccent: "#0D0F14",
  statePositive: "#22C55E",
  stateNegative: "#EC6A74",
};
let mockScheme: "dark" | "light" = "dark";
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => TOKENS,
  useResolvedColorScheme: () => mockScheme,
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const make = (name: string) => (props: { color?: string }) =>
    R.createElement(RN.View, { testID: `icon-${name}`, color: props.color });
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) =>
        prop === "__esModule" ? true : make(prop),
    },
  );
});
const mockHapticError = jest.fn(() => Promise.resolve());
jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: { error: () => mockHapticError(), resultRecorded: jest.fn() },
}));
const mockDispute = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  disputeMatchResult: (...a: unknown[]) => mockDispute(...a),
}));
jest.mock("@/lib/match-flow/use-record-result", () => ({
  useRecordResult: () => ({ loading: false, submit: jest.fn() }),
}));

import { ResultStep } from "@/components/match-flow/steps/result-step";
import { EndStep } from "@/components/match-flow/steps/end-step";
import { DisputeForm } from "@/components/match-flow/steps/dispute-form";

function plateClass(node: { parent: unknown }): string {
  // The icon's parent is the Plate's View.
  const parent = node.parent as { props: { className?: string } };
  return parent.props.className ?? "";
}

beforeEach(() => {
  jest.clearAllMocks();
  mockScheme = "dark";
});

describe("ResultStep draw", () => {
  function renderResult(matchType: "ranked" | "casual" = "ranked") {
    return render(
      <ResultStep
        matchId="M1"
        matchType={matchType}
        durationSeconds={300}
        participants={[
          { id: "me-1", displayName: "Me" },
          { id: "opp-1", displayName: "Demo Red" },
        ]}
        submissionTypes={[]}
        onRecorded={jest.fn()}
      />,
    );
  }

  it("keeps the harness heading and record testID", () => {
    const { getAllByText, getByTestId } = renderResult();
    // The heading (the harness reads it) and the CTA label both match.
    expect(getAllByText(/^record result$/i).length).toBeGreaterThanOrEqual(1);
    getByTestId("result-record");
  });

  it("shows the draw on a default plate with an amber handshake and honest copy", () => {
    const screen = renderResult();
    fireEvent.press(screen.getByText("Draw"));
    screen.getByText("Match ends in a draw");
    screen.getByText("Draws cost both athletes rating.");
    // The Draw chip in the toggle has its own handshake; the plate's is last.
    const icon = screen.getAllByTestId("icon-Handshake").at(-1)!;
    expect(icon.props.color).toBe("#F59E0B");
    expect(icon.props.color).not.toBe(TOKENS.stateNegative);
    expect(plateClass(icon)).not.toMatch(/border-l-negative/);
  });

  it("does not claim a casual draw costs rating", () => {
    const screen = renderResult("casual");
    fireEvent.press(screen.getByText("Draw"));
    screen.getByText("Match ends in a draw");
    expect(screen.queryByText(/cost both athletes rating/i)).toBeNull();
    screen.getByText("Casual match: no rating change.");
  });

  it("uses the darker amber on light surfaces", () => {
    mockScheme = "light";
    const screen = renderResult();
    fireEvent.press(screen.getByText("Draw"));
    expect(screen.getAllByTestId("icon-Handshake").at(-1)!.props.color).toBe("#D97706");
  });
});

describe("EndStep", () => {
  it("is neutral: default plate, ink check, and an honest caption", () => {
    jest.useFakeTimers();
    const screen = render(<EndStep onAdvance={jest.fn()} />);
    screen.getByText("MATCH ENDED");
    screen.getByText("Up next: record the result");
    expect(screen.queryByText(/recording result/i)).toBeNull();
    const icon = screen.getByTestId("icon-CheckCircle2");
    expect(icon.props.color).toBe(TOKENS.textPrimary);
    expect(plateClass(icon)).not.toMatch(/border-l-positive/);
    jest.useRealTimers();
  });

  it("still auto-advances", () => {
    jest.useFakeTimers();
    const onAdvance = jest.fn();
    render(<EndStep delayMs={800} onAdvance={onAdvance} />);
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe("DisputeForm", () => {
  function renderForm() {
    return render(<DisputeForm matchId="M1" onCancel={jest.fn()} onSubmitted={jest.fn()} />);
  }

  it("explains what a dispute does, with the harness heading and testIDs", () => {
    const screen = renderForm();
    screen.getByText(/^dispute result$/i);
    screen.getByText(/An admin reviews every dispute; ratings stay as recorded until then/);
    screen.getByText(/your opponent will see it was disputed/);
    expect(screen.getByTestId("dispute-reason").props.placeholder).toBe(
      "What went wrong? (optional)",
    );
    screen.getByTestId("dispute-submit");
  });

  it("uses an amber warning glyph, not red", () => {
    const screen = renderForm();
    expect(screen.getByTestId("icon-AlertTriangle").props.color).toBe("#F59E0B");
  });

  it("a failed dispute buzzes the error haptic", async () => {
    mockDispute.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "nope" } });
    const onSubmitted = jest.fn();
    const screen = render(
      <DisputeForm matchId="M1" onCancel={jest.fn()} onSubmitted={onSubmitted} />,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("dispute-submit"));
    });
    expect(mockHapticError).toHaveBeenCalledTimes(1);
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("a successful dispute does not buzz the error haptic", async () => {
    mockDispute.mockResolvedValue({ ok: true, data: {} });
    const onSubmitted = jest.fn();
    const screen = render(
      <DisputeForm matchId="M1" onCancel={jest.fn()} onSubmitted={onSubmitted} />,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("dispute-submit"));
    });
    expect(mockHapticError).not.toHaveBeenCalled();
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });
});
