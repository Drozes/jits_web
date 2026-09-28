/**
 * The result step's finish time is prefilled from the match clock taken when
 * the live step ended (initialFinishSeconds). It stays editable and required
 * for a submission; a draw ignores it; with no reading it starts empty.
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import type { SubmissionType } from "@jits/shared/types/submission-type";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textTertiary: "#8D929D", textOnAccent: "#0D0F14" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) =>
        prop === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${prop}` }),
    },
  );
});
const mockSubmit = jest.fn();
jest.mock("@/lib/match-flow/use-record-result", () => ({
  useRecordResult: () => ({ loading: false, submit: mockSubmit }),
}));

import { ResultStep } from "@/components/match-flow/steps/result-step";

const TYPES: SubmissionType[] = [
  { code: "armbar", display_name: "Armbar", category: "joint", id: "armbar", sort_order: 0, status: "active" },
];

function renderResult(initialFinishSeconds?: number) {
  const s = render(
    <ResultStep
      matchId="M1"
      matchType="ranked"
      durationSeconds={300}
      initialFinishSeconds={initialFinishSeconds}
      participants={[
        { id: "me-1", displayName: "Me" },
        { id: "opp-1", displayName: "Opp" },
      ]}
      submissionTypes={TYPES}
      onRecorded={jest.fn()}
    />,
  );
  return s;
}

function toSubmissionFields(s: ReturnType<typeof render>) {
  fireEvent.press(s.getByTestId("result-outcome-submission"));
  fireEvent.press(s.getByTestId("result-winner-me-1"));
  fireEvent.press(s.getByTestId("result-submission"));
  fireEvent.press(s.getByTestId("result-submission-option-armbar"));
}

beforeEach(() => mockSubmit.mockClear());

describe("ResultStep finish time prefill", () => {
  it("shows the clock reading as mm:ss with a From match clock hint", () => {
    const s = renderResult(270);
    toSubmissionFields(s);
    expect(s.getByTestId("result-finish-time").props.value).toBe("04:30");
    expect(s.getByTestId("result-finish-time-hint")).toHaveTextContent("From match clock");
    expect(s.getByTestId("result-record")).not.toBeDisabled();
    fireEvent.press(s.getByTestId("result-record"));
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "submission", finishTimeStr: "04:30" }),
    );
  });

  it("stays editable and required: editing drops the hint, clearing blocks submit", () => {
    const s = renderResult(270);
    toSubmissionFields(s);
    const field = () => s.getByTestId("result-finish-time");
    fireEvent.changeText(field(), "3:15");
    expect(field().props.value).toBe("3:15");
    expect(s.queryByTestId("result-finish-time-hint")).toBeNull();
    fireEvent.changeText(field(), "");
    expect(s.getByTestId("result-record")).toBeDisabled();
    fireEvent.changeText(field(), "0");
    expect(s.getByTestId("result-record")).toBeDisabled();
  });

  it("starts empty with no hint when there is no clock reading", () => {
    const s = renderResult();
    toSubmissionFields(s);
    expect(s.getByTestId("result-finish-time").props.value).toBe("");
    expect(s.queryByTestId("result-finish-time-hint")).toBeNull();
    expect(s.getByTestId("result-record")).toBeDisabled();
  });

  it("a draw is unaffected by the prefill", () => {
    const s = renderResult(270);
    fireEvent.press(s.getByTestId("result-outcome-draw"));
    expect(s.queryByTestId("result-finish-time")).toBeNull();
    fireEvent.press(s.getByTestId("result-record"));
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "draw" }));
  });
});
