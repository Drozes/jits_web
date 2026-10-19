/**
 * The result step's entry policy (timekeeper mode ARCHITECTURE 2.3, PR3).
 * "claim", the default, is today's claim-first entry (its own suite is
 * result-step-claim.test.tsx). "sole": this viewer is the only recorder, so
 * nothing is claimed and no other phone's claim can lock the form. "wait":
 * someone else records; the waiting view names them and never offers a
 * take-over. The submission layout input defaults to today's chips.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import type { SubmissionType } from "@jits/shared/types/submission-type";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textTertiary: "#8D929D", textOnAccent: "#0D0F14" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});

const mockSubmit = jest.fn();
const mockClaimBroadcast = jest.fn();
let mockOnResultClaimed: ((id: string, at: number, supersedes?: number | null) => void) | undefined;
jest.mock("@/lib/match-flow/use-record-result", () => ({
  useRecordResult: (p: { onResultClaimed?: (id: string, at: number, supersedes?: number | null) => void }) => {
    mockOnResultClaimed = p.onResultClaimed;
    return { loading: false, submit: mockSubmit, broadcastResultClaimed: mockClaimBroadcast };
  },
}));

import { ResultStep } from "@/components/match-flow/steps/result-step";
import { CLAIM_TAKEOVER_MS } from "@/lib/match-flow/use-result-claim";

const type = (code: string, display_name: string, sort_order: number): SubmissionType =>
  ({ code, display_name, category: "x", id: code, sort_order, status: "active" }) as SubmissionType;
const TYPES = [type("rear_naked_choke", "Rear Naked Choke", 1), type("armbar", "Armbar", 2), type("other", "Other Submission", 3)];

const BASE = {
  matchId: "M1",
  durationSeconds: 600,
  initialFinishSeconds: 377,
  me: { athleteId: "me-1", displayName: "Kai Reyes", currentElo: 1512, weightLbs: 170 },
  opponent: { athleteId: "opp-1", displayName: "Mina Park", currentElo: 1498, weightLbs: 168 },
  submissionTypes: TYPES,
  onRecorded: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOnResultClaimed = undefined;
});
afterEach(() => jest.useRealTimers());

describe("sole", () => {
  it("records without claiming: no claim broadcast and no 'recording for both' line", () => {
    const s = render(<ResultStep {...BASE} entryPolicy="sole" />);
    fireEvent.press(s.getByTestId("result-winner-me-1"));
    s.getByTestId("result-winner-chip");
    expect(mockClaimBroadcast).not.toHaveBeenCalled();
    expect(s.queryByText(/recording for both of you/)).toBeNull();
  });

  it("another phone's claim never locks the form", () => {
    const s = render(<ResultStep {...BASE} entryPolicy="sole" />);
    act(() => mockOnResultClaimed?.("opp-1", 1000));
    expect(s.queryByTestId("result-waiting")).toBeNull();
    s.getByTestId("result-winner-me-1");
  });

  it("submits the result like the claim-first form", () => {
    const s = render(<ResultStep {...BASE} entryPolicy="sole" />);
    fireEvent.press(s.getByTestId("result-outcome-draw"));
    fireEvent.press(s.getByTestId("result-record"));
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "draw" }));
  });
});

describe("wait", () => {
  it("waits on the named recorder, with no form and no take-over, however long it takes", () => {
    jest.useFakeTimers();
    const s = render(<ResultStep {...BASE} entryPolicy="wait" recorderName="Jamal Cruz" />);
    s.getByTestId("result-waiting");
    s.getByText("J. Cruz is recording the result");
    expect(s.queryByTestId("result-winner-me-1")).toBeNull();
    expect(s.queryByTestId("result-outcome-draw")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(CLAIM_TAKEOVER_MS + 5_000);
    });
    expect(s.queryByTestId("result-take-over")).toBeNull();
    expect(mockClaimBroadcast).not.toHaveBeenCalled();
  });
});

describe("claim (default)", () => {
  it("is today's claim-first entry", () => {
    const s = render(<ResultStep {...BASE} />);
    fireEvent.press(s.getByTestId("result-winner-me-1"));
    expect(mockClaimBroadcast).toHaveBeenCalledWith("me-1", expect.any(Number));
    s.getByText("You're recording for both of you. M. Park sees this live.");
  });
});

describe("submission layout input", () => {
  it("chips, the default, is today's grid of finishes", () => {
    const s = render(<ResultStep {...BASE} submissionLayout="chips" />);
    fireEvent.press(s.getByTestId("result-winner-me-1"));
    s.getByText("HOW DID IT END?");
    s.getByTestId("result-submission-armbar");
  });
});
