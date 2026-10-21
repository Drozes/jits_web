/**
 * The result step in timekeeper mode (spec 4.2 Result, 4.3 stall; TEST-PLAN
 * 3.2 `result-step-tk`):
 *  - the timekeeper ("sole"): no claim, TK-R1 under the form, the tiles name
 *    the athletes with no YOU / OPPONENT, the full scrollable list (A12), the
 *    final clock bounds and prefills the finish, and TK-D10 once the result
 *    has stalled into admin review;
 *  - the athletes ("wait"): the waiting view with no take-over, TK-D8 in
 *    place of "is recording" once the result has stalled (board B9 frame 7),
 *    and a blank recorder name reads as the role, never "Opponent"
 *    (jits-o47s.27).
 * The claim-first two-athlete form is unchanged by the new inputs.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
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
import { paletteFor } from "@/lib/theme/palette";

/** The theme the tests render in (`useResolvedColorScheme` is mocked dark). */
const DARK = paletteFor("dark");
const colorOf = (node: { props: { style: StyleProp<TextStyle> } }) => StyleSheet.flatten(node.props.style)?.color;

const type = (code: string, display_name: string, sort_order: number): SubmissionType =>
  ({ code, display_name, category: "x", id: code, sort_order, status: "active" }) as SubmissionType;
const TYPES = [
  type("rear_naked_choke", "Rear Naked Choke", 1),
  type("armbar", "Armbar", 2),
  type("toe_hold", "Toe Hold", 3),
  type("other", "Other Submission", 4),
];

/** The timekeeper's pair: the two athletes, challenger first, on their rated weights. */
const CHALLENGER = { athleteId: "ch", displayName: "Marco Reyes", currentElo: 1512, weightLbs: 172.5 };
const OPPONENT = { athleteId: "op", displayName: "Dayo Okafor", currentElo: 1487, weightLbs: 171.4 };

const BASE = {
  matchId: "M1",
  durationSeconds: 300,
  initialFinishSeconds: 229,
  me: CHALLENGER,
  opponent: OPPONENT,
  submissionTypes: TYPES,
  onRecorded: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOnResultClaimed = undefined;
});
afterEach(() => jest.useRealTimers());

describe("the timekeeper records (sole)", () => {
  function renderSole(extra: { finalElapsedS?: number | null; reviewPending?: boolean } = {}) {
    return render(<ResultStep {...BASE} entryPolicy="sole" submissionLayout="list" finalElapsedS={228} {...extra} />);
  }

  it("TK-R1 under the form, the athletes by name with no YOU / OPPONENT, no claim", () => {
    const s = renderSole();
    s.getByText("You're recording for M. Reyes and D. Okafor. They confirm it next.");
    expect(s.queryByText("YOU")).toBeNull();
    expect(s.queryByText("OPPONENT")).toBeNull();
    fireEvent.press(s.getByTestId("result-winner-op"));
    expect(mockClaimBroadcast).not.toHaveBeenCalled();
    expect(s.queryByText(/recording for both of you/)).toBeNull();
    // Another phone's claim never locks the form.
    act(() => mockOnResultClaimed?.("ch", 1000));
    expect(s.queryByTestId("result-waiting")).toBeNull();
  });

  it("the full scrollable list (A12), and the finish on the final clock (the server's, not this phone's)", () => {
    const s = renderSole();
    s.getByText("ENDED AT 03:48");
    fireEvent.press(s.getByTestId("result-winner-ch"));
    s.getByTestId("result-submission-list");
    s.getByTestId("result-submission-other");
    fireEvent.press(s.getByTestId("result-submission-toe_hold"));
    expect(s.getByTestId("result-finish-time").props.value).toBe("03:48");
    fireEvent.changeText(s.getByTestId("result-finish-time"), "3:49");
    s.getByText("WITHIN 03:48");
    fireEvent.changeText(s.getByTestId("result-finish-time"), "3:48");
    fireEvent.press(s.getByTestId("result-record"));
    expect(mockSubmit).toHaveBeenCalledWith({ outcome: "submission", winnerId: "ch", submissionCode: "toe_hold", finishTimeStr: "3:48" });
  });

  it("before the final clock is read, this phone's own reading stands in", () => {
    const s = renderSole({ finalElapsedS: null });
    s.getByText("ENDED AT 03:49");
    fireEvent.press(s.getByTestId("result-winner-ch"));
    expect(s.getByTestId("result-finish-time").props.value).toBe("03:49");
  });

  it("TK-D10 once the result has stalled into admin review, and not before", () => {
    const s = renderSole({ reviewPending: true });
    expect(s.getByTestId("result-form-notice")).toHaveTextContent("Record the result now. Without it, an admin reviews the match.");
    // In the attention token (amber), never red.
    expect(colorOf(s.getByTestId("result-form-notice"))).toBe(DARK.amber);
    s.rerender(<ResultStep {...BASE} entryPolicy="sole" submissionLayout="list" finalElapsedS={228} reviewPending={false} />);
    expect(s.queryByTestId("result-form-notice")).toBeNull();
  });
});

describe("the athletes wait (wait)", () => {
  it("the waiting view, no take-over however long it takes, the ended clock from the server", () => {
    jest.useFakeTimers();
    const s = render(<ResultStep {...BASE} entryPolicy="wait" recorderName="Jamal Cruz" finalElapsedS={228} />);
    s.getByTestId("result-waiting");
    s.getByText("J. Cruz is recording the result");
    s.getByText("You\u2019ll confirm it in a moment.");
    s.getByText("03:48");
    act(() => {
      jest.advanceTimersByTime(CLAIM_TAKEOVER_MS + 5_000);
    });
    expect(s.queryByTestId("result-take-over")).toBeNull();
    expect(s.queryByTestId("result-waiting-notice")).toBeNull();
  });

  it("TK-D8 once the timekeeper's result has stalled into admin review, in place of 'is recording' (board B9 frame 7)", () => {
    const s = render(<ResultStep {...BASE} entryPolicy="wait" recorderName="Jamal Cruz" finalElapsedS={228} reviewPending />);
    expect(s.getByTestId("result-waiting-notice")).toHaveTextContent("J. CRUZ DIDN'T RECORD THE RESULT · AN ADMIN WILL REVIEW IT");
    // In the attention token (amber), never red, on a dashed attention plate.
    expect(colorOf(s.getByTestId("result-waiting-notice"))).toBe(DARK.amber);
    expect(StyleSheet.flatten(s.getByTestId("result-waiting-review").props.style)).toMatchObject({ borderStyle: "dashed", borderColor: DARK.amber });
    // Nobody is recording any more: the waiting headline and line are gone, the matchup plate stays.
    expect(s.queryByText("J. Cruz is recording the result")).toBeNull();
    expect(s.queryByText("You\u2019ll confirm it in a moment.")).toBeNull();
    s.getByText("MATCH OVER");
    s.getByText("03:48");
  });

  it("a blank recorder name reads as the role, never 'Opponent' (jits-o47s.27)", () => {
    for (const name of ["", "  "]) {
      const waiting = render(<ResultStep {...BASE} entryPolicy="wait" recorderName={name} />);
      waiting.getByText("TIMEKEEPER is recording the result");
      expect(waiting.queryByText(/Opponent/)).toBeNull();
      waiting.unmount();
      const stalled = render(<ResultStep {...BASE} entryPolicy="wait" recorderName={name} reviewPending />);
      expect(stalled.getByTestId("result-waiting-notice")).toHaveTextContent("TIMEKEEPER DIDN'T RECORD THE RESULT · AN ADMIN WILL REVIEW IT");
      expect(stalled.queryByText(/Opponent/)).toBeNull();
      stalled.unmount();
    }
  });
});

describe("the two-athlete form ignores the timekeeper inputs it never gets", () => {
  it("claim-first: YOU / OPPONENT and the claim line, no TK-R1 or TK-D10", () => {
    const s = render(<ResultStep {...BASE} me={{ ...CHALLENGER }} reviewPending />);
    s.getByText("YOU");
    s.getByText("OPPONENT");
    fireEvent.press(s.getByTestId("result-winner-ch"));
    s.getByText("You're recording for both of you. D. Okafor sees this live.");
    expect(s.queryByTestId("result-form-notice")).toBeNull();
    expect(s.queryByText(/They confirm it next/)).toBeNull();
    // The chips, not the list.
    expect(s.queryByTestId("result-submission-list")).toBeNull();
  });
});
