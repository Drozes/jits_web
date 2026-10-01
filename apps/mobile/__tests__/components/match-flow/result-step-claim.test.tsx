/**
 * Claim-first result entry. The first tap on a winner or Draw claims the
 * form (broadcast `result_claimed`); the other phone shows the waiting view
 * and cannot open the form; a claim that goes quiet for 20 s unlocks it; a
 * simultaneous claim resolves the same way on both phones. Plus the eight
 * one-tap finishes and the full search.
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
import { commonSubmissions } from "@/components/match-flow/steps/result-form";
import { CLAIM_STALE_MS, CLAIM_TAKEOVER_MS } from "@/lib/match-flow/use-result-claim";

const type = (code: string, display_name: string, sort_order: number): SubmissionType =>
  ({ code, display_name, category: "x", id: code, sort_order, status: "active" }) as SubmissionType;
const TYPES = [
  type("rear_naked_choke", "Rear Naked Choke", 1),
  type("guillotine", "Guillotine", 2),
  type("darce_choke", "D'Arce Choke", 3),
  type("anaconda_choke", "Anaconda Choke", 4),
  type("triangle_choke", "Triangle Choke", 5),
  type("armbar", "Armbar", 6),
  type("kimura", "Kimura", 7),
  type("americana", "Americana", 8),
  type("heel_hook", "Heel Hook", 9),
  type("toe_hold", "Toe Hold", 10),
  type("other", "Other Submission", 11),
];

function renderStep() {
  return render(
    <ResultStep
      matchId="M1"
      durationSeconds={600}
      initialFinishSeconds={377}
      me={{ id: "me-1", displayName: "Kai Reyes", elo: 1512, weight: 170 }}
      opponent={{ id: "opp-1", displayName: "Mina Park", elo: 1498, weight: 168 }}
      submissionTypes={TYPES}
      onRecorded={jest.fn()}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOnResultClaimed = undefined;
});
afterEach(() => jest.useRealTimers());

describe("claim-first", () => {
  it("the first tap on a winner claims the form and says so", () => {
    const s = renderStep();
    s.getByText("ENDED AT 06:17");
    fireEvent.press(s.getByTestId("result-winner-me-1"));
    expect(mockClaimBroadcast).toHaveBeenCalledWith("me-1", expect.any(Number));
    s.getByText("You're recording for both of you. M. Park sees this live.");
    s.getByText("Change");
  });

  it("an opponent's claim shows the waiting view, with no way into the form", () => {
    const s = renderStep();
    act(() => mockOnResultClaimed?.("opp-1", 1000));
    s.getByTestId("result-waiting");
    s.getByText("MATCH OVER");
    s.getByText("M. Park is recording the result");
    s.getByText("You\u2019ll confirm it in a moment.");
    s.getByText("ENDED AT");
    expect(s.queryByText("RANKED")).toBeNull();
    expect(s.queryByTestId("result-winner-me-1")).toBeNull();
    expect(s.queryByTestId("result-outcome-draw")).toBeNull();
  });

  it("the waiting view has no 'confirm later' exit (jits-02vo.7, P-Result-Waiting)", () => {
    const s = renderStep();
    act(() => mockOnResultClaimed?.("opp-1", 1000));
    s.getByTestId("result-waiting");
    expect(s.queryByTestId("result-leave-later")).toBeNull();
    expect(s.queryByText(/confirm later/i)).toBeNull();
    expect(s.queryByText(/leave/i)).toBeNull();
  });

  it("unlocks the form when the claimer goes quiet for 20 s, not before", () => {
    jest.useFakeTimers();
    const s = renderStep();
    act(() => mockOnResultClaimed?.("opp-1", 1000));
    act(() => {
      jest.advanceTimersByTime(CLAIM_STALE_MS - 2_000);
    });
    s.getByTestId("result-waiting");
    // A heartbeat keeps it locked.
    act(() => mockOnResultClaimed?.("opp-1", 1000));
    act(() => {
      jest.advanceTimersByTime(CLAIM_STALE_MS - 2_000);
    });
    s.getByTestId("result-waiting");
    act(() => {
      jest.advanceTimersByTime(4_000);
    });
    expect(s.queryByTestId("result-waiting")).toBeNull();
    s.getByTestId("result-winner-me-1");
  });

  it("the holder repeats its claim as a heartbeat", () => {
    jest.useFakeTimers();
    const s = renderStep();
    fireEvent.press(s.getByTestId("result-outcome-draw"));
    const at = mockClaimBroadcast.mock.calls[0][1];
    act(() => {
      jest.advanceTimersByTime(10_500);
    });
    expect(mockClaimBroadcast).toHaveBeenCalledTimes(3);
    expect(mockClaimBroadcast).toHaveBeenLastCalledWith("me-1", at, null);
  });

  it("a simultaneous claim: the earlier one stands on both phones", () => {
    const s = renderStep();
    fireEvent.press(s.getByTestId("result-winner-opp-1"));
    const mine = mockClaimBroadcast.mock.calls[0][1] as number;
    // Theirs is later: mine stands and is re-announced at once.
    act(() => mockOnResultClaimed?.("opp-1", mine + 50));
    expect(s.queryByTestId("result-waiting")).toBeNull();
    expect(mockClaimBroadcast).toHaveBeenCalledTimes(2);
    // Theirs is earlier: this phone yields.
    act(() => mockOnResultClaimed?.("opp-1", mine - 50));
    s.getByTestId("result-waiting");
  });

  it("after a minute of a live claim with no result, the waiting athlete may take over", () => {
    jest.useFakeTimers();
    const s = renderStep();
    act(() => mockOnResultClaimed?.("opp-1", 1000));
    expect(s.queryByTestId("result-take-over")).toBeNull();
    // Their heartbeats keep the claim alive the whole time.
    for (let t = 0; t < CLAIM_TAKEOVER_MS; t += 5_000) {
      act(() => {
        jest.advanceTimersByTime(5_000);
      });
      act(() => mockOnResultClaimed?.("opp-1", 1000));
    }
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    fireEvent.press(s.getByTestId("result-take-over"));
    // The takeover names the claim it replaces.
    expect(mockClaimBroadcast).toHaveBeenLastCalledWith("me-1", expect.any(Number), 1000);
    s.getByTestId("result-winner-me-1");
    // A late heartbeat of the replaced claim does not take it back.
    act(() => mockOnResultClaimed?.("opp-1", 1000));
    expect(s.queryByTestId("result-waiting")).toBeNull();
  });

  it("the claimer yields to a takeover of its claim", () => {
    const s = renderStep();
    fireEvent.press(s.getByTestId("result-winner-me-1"));
    const mine = mockClaimBroadcast.mock.calls[0][1] as number;
    act(() => mockOnResultClaimed?.("opp-1", mine + 60_000, mine));
    s.getByTestId("result-waiting");
  });

  it("ignores its own echo", () => {
    const s = renderStep();
    act(() => mockOnResultClaimed?.("me-1", 1));
    expect(s.queryByTestId("result-waiting")).toBeNull();
  });
});

describe("the form", () => {
  it("offers eight common finishes, most common first, and never Other", () => {
    const codes = commonSubmissions(TYPES).map((t) => t.code);
    expect(codes).toEqual([
      "rear_naked_choke",
      "armbar",
      "triangle_choke",
      "guillotine",
      "kimura",
      "heel_hook",
      "darce_choke",
      "americana",
    ]);
  });

  it("records a submission with a grid finish and the clock prefill", () => {
    const s = renderStep();
    fireEvent.press(s.getByTestId("result-winner-me-1"));
    expect(s.getByTestId("result-record")).toBeDisabled();
    fireEvent.press(s.getByTestId("result-submission-armbar"));
    expect(s.getByTestId("result-finish-time").props.value).toBe("06:17");
    fireEvent.press(s.getByTestId("result-record"));
    expect(mockSubmit).toHaveBeenCalledWith({ outcome: "submission", winnerId: "me-1", submissionCode: "armbar", finishTimeStr: "06:17" });
  });

  it("finds any finish through the full search", () => {
    const s = renderStep();
    fireEvent.press(s.getByTestId("result-winner-opp-1"));
    fireEvent.press(s.getByTestId("result-submission"));
    fireEvent.press(s.getByTestId("result-submission-option-toe_hold"));
    fireEvent.press(s.getByTestId("result-record"));
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ winnerId: "opp-1", submissionCode: "toe_hold" }));
  });

  it("Change goes back to the winner tiles", () => {
    const s = renderStep();
    fireEvent.press(s.getByTestId("result-winner-me-1"));
    fireEvent.press(s.getByTestId("result-change"));
    s.getByTestId("result-winner-opp-1");
    expect(s.queryByTestId("result-record")).toBeNull();
  });
});
