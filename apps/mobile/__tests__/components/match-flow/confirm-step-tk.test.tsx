/**
 * The athletes' confirm in timekeeper mode (spec 4.2 Confirm and Result
 * edit, 11; TEST-PLAN 3.2 `confirm-step-tk`): the header names the
 * timekeeper from the start (TK-R5; TK-R5b for an admin's record; TK-RC1 and
 * TK-RC2 after an edit), no rating block (A25), the confirm carries the edit
 * count it confirms at, a stale count is TK-RC4 and the new result, and an
 * edit landing after the confirm keeps the athlete on confirm: the step
 * never completes into the verdict on a result that has since changed (A8;
 * the wizard's A8 baseline, use-wizard-sync.ts, relies on it). A blank
 * recorder name names nobody, never the opponent (jits-o47s.27). The step
 * mounts the TK-RC3 notice (`useResultEditNotice`, through
 * `useConfirmResult`): an athlete the wizard brings back after an edit reset
 * their confirmation is told once; never in a two-athlete match.
 *
 * PM29 (honest presses): from the tap Confirm is busy and Dispute disabled,
 * the you row keeps WAITING ON YOU until the server has the confirm, a press
 * with no reply ends as failed after SEND_CEILING_MS, a refusal sorts into
 * result changed (TK-RC4, then Confirm and Dispute wait for the newer
 * result), moved on (no toast) and failed (`Couldn't confirm` / `Check your
 * connection and try again.`), and nothing shows after the step unmounted.
 */
import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, renderHook } from "@testing-library/react-native";
import { resetLockSecondsCache } from "@/lib/match-flow/use-dispute-locks-at";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("@/components/ui/toast", () => ({
  toast: {
    success: (...a: unknown[]) => mockToast.success(...a),
    error: (...a: unknown[]) => mockToast.error(...a),
    info: (...a: unknown[]) => mockToast.info(...a),
  },
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textSecondary: "#aaa", statePositive: "#0f0", textOnAccent: "#000" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) });
});
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: "light" } }));
const mockHapticError = jest.fn(() => Promise.resolve());
jest.mock("@/lib/match-flow/use-haptics", () => ({ matchHaptics: { error: () => mockHapticError(), resultRecorded: jest.fn() } }));
const mockConfirm = jest.fn();
const mockDispute = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  confirmMatchResult: (...a: unknown[]) => mockConfirm(...a),
  disputeMatchResult: (...a: unknown[]) => mockDispute(...a),
}));
jest.mock("@jits/shared/api/queries", () => ({ getMatchResultLockSeconds: jest.fn(async () => 86_400) }));
const mockIsQueued = jest.fn((_v: unknown) => false);
jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: { enqueue: (_k: string, fn: () => unknown) => fn() },
  isQueuedResult: (v: unknown) => mockIsQueued(v),
}));
const mockReconcileNow = jest.fn();
/** The step's broadcast handlers, as it last passed them. */
const mockSync: { onResultConfirmed?: (athleteId: string) => void; onMatchDisputed?: (athleteId: string) => void } = {};
jest.mock("@/lib/match-flow/match-sync-context", () => ({
  SEND_GRACE_MS: 1_500,
  useMatchSyncContext: () => ({ reconcileNow: mockReconcileNow }),
  useStepMatchSync: (p: { onResultConfirmed?: (athleteId: string) => void; onMatchDisputed?: (athleteId: string) => void }) => {
    mockSync.onResultConfirmed = p.onResultConfirmed;
    mockSync.onMatchDisputed = p.onMatchDisputed;
    return {
      broadcastResultConfirmed: jest.fn(() => Promise.resolve()),
      broadcastMatchDisputed: jest.fn(() => Promise.resolve()),
    };
  },
}));
const mockNoteConfirmed = jest.fn();
// The real notice (module-scope record and all), with its confirm record watched.
jest.mock("@/lib/match-flow/use-result-edit-notice", () => {
  const actual = jest.requireActual("@/lib/match-flow/use-result-edit-notice");
  return {
    ...actual,
    noteResultConfirmed: (...a: [string, string, number]) => {
      mockNoteConfirmed(...a);
      actual.noteResultConfirmed(...a);
    },
  };
});

import { ADVANCE_AFTER_CONFIRM_MS, ConfirmStep } from "@/components/match-flow/steps/confirm-step";
import { SEND_CEILING_MS } from "@/lib/match-flow/send-timing";
import { resetResultEditNotices } from "@/lib/match-flow/use-result-edit-notice";
import { useConfirmResult } from "@/lib/match-flow/use-confirm-result";

type StepProps = React.ComponentProps<typeof ConfirmStep>;

/** The viewer with the rating the match stamped: never shown on confirm (A25). */
const ME = { athleteId: "me-1", displayName: "Mina Park", eloBefore: 1498, eloAfter: 1510, eloDelta: 12 };

function props(overrides: Partial<StepProps> = {}): StepProps {
  return {
    matchId: "M1",
    me: ME,
    opponent: { athleteId: "opp-1", displayName: "Demo Okafor" },
    resultData: { result: "submission", winnerId: "me-1" },
    confirmedAthleteIds: [],
    submissionName: "Armbar",
    finishTimeSeconds: 228,
    disputeLocksAt: null,
    recorderName: "Jamal Cruz",
    timekeeperResult: { editCount: 0, recordedByAdmin: false },
    matchLengthSeconds: 300,
    onCompleted: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetLockSecondsCache();
  resetResultEditNotices();
  mockSync.onResultConfirmed = undefined;
  mockSync.onMatchDisputed = undefined;
  mockConfirm.mockResolvedValue({ ok: true, data: {} });
  mockDispute.mockResolvedValue({ ok: true, data: {} });
  mockIsQueued.mockReturnValue(false);
});
afterEach(() => jest.useRealTimers());

describe("the header", () => {
  it("names the timekeeper from the start, whatever the opponent's confirmation says (TK-R5)", () => {
    const before = render(<ConfirmStep {...props()} />);
    before.getByText("RESULT RECORDED BY J. CRUZ");
    const after = render(<ConfirmStep {...props({ confirmedAthleteIds: ["opp-1"] })} />);
    after.getByText("RESULT RECORDED BY J. CRUZ");
    expect(after.queryByText("RESULT RECORDED BY D. OKAFOR")).toBeNull();
    after.getByText("D. OKAFOR CONFIRMED ✓");
  });

  it("an admin's record reads TK-R5b", () => {
    const s = render(<ConfirmStep {...props({ timekeeperResult: { editCount: 0, recordedByAdmin: true } })} />);
    s.getByText("RESULT RECORDED BY AN ADMIN");
    expect(s.queryByText(/J\. CRUZ/)).toBeNull();
  });

  it("after an edit: TK-RC1 and TK-RC2 in place of the helper", () => {
    const s = render(<ConfirmStep {...props({ timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
    s.getByText("J. CRUZ CHANGED THE RESULT");
    expect(s.getByTestId("confirm-helper")).toHaveTextContent("Check it and confirm again.");
  });

  it("before an edit: the helper is TK-R8", () => {
    const s = render(<ConfirmStep {...props()} />);
    expect(s.getByTestId("confirm-helper")).toHaveTextContent("Confirm if this is right, or dispute it and an admin will review.");
  });

  it("a blank recorder name names nobody, never the opponent (jits-o47s.27)", () => {
    for (const name of ["", "   "]) {
      const s = render(<ConfirmStep {...props({ recorderName: name, confirmedAthleteIds: ["opp-1"] })} />);
      s.getByText("RESULT RECORDED");
      expect(s.queryByText(/OPPONENT|D\. OKAFOR$/)).toBeNull();
      s.unmount();
    }
    const edited = render(<ConfirmStep {...props({ recorderName: "", timekeeperResult: { editCount: 2, recordedByAdmin: false } })} />);
    edited.getByText("RESULT RECORDED");
    edited.getByText("Check it and confirm again.");
  });
});

describe("the result", () => {
  it("winner, how it ended and the match length; no rating block (A25)", () => {
    const s = render(<ConfirmStep {...props()} />);
    s.getByText("M. Park won");
    expect(s.getByTestId("confirm-verdict")).toHaveTextContent("YOU WON");
    expect(s.getByTestId("result-how-it-ended")).toHaveTextContent("Armbar");
    expect(s.getByTestId("result-match-length")).toHaveTextContent("03:48");
    expect(s.queryByText("YOUR RATING")).toBeNull();
    expect(s.queryByText(/1498|1510|\+12/)).toBeNull();
  });

  it("a draw's match length is the final clock", () => {
    const s = render(<ConfirmStep {...props({ resultData: { result: "draw" }, submissionName: null, finishTimeSeconds: 228 })} />);
    expect(s.getByTestId("result-how-it-ended")).toHaveTextContent("DRAW");
    expect(s.getByTestId("result-match-length")).toHaveTextContent("05:00");
  });
});

describe("confirming", () => {
  it("carries the edit count it confirms at, and records it for TK-RC3", async () => {
    const s = render(<ConfirmStep {...props({ timekeeperResult: { editCount: 2, recordedByAdmin: false } })} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    expect(mockConfirm).toHaveBeenCalledWith({ tag: "client" }, "M1", 2);
    expect(mockNoteConfirmed).toHaveBeenCalledWith("M1", "me-1", 2);
    s.getByTestId("confirm-panel-you-confirmed");
  });

  it("then moves on to the verdict, as in the two-athlete flow", async () => {
    jest.useFakeTimers();
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    act(() => {
      jest.advanceTimersByTime(1_500);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("a stale count (RESULT_CHANGED): TK-RC4, the new result is read, and the athlete stays on confirm", async () => {
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "RESULT_CHANGED", message: "The result just changed" } });
    jest.useFakeTimers();
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    expect(mockToast.info).toHaveBeenCalledWith({ text1: "The result just changed", description: "Check the new result, then confirm." });
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockHapticError).not.toHaveBeenCalled();
    expect(mockReconcileNow).toHaveBeenCalledTimes(1);
    expect(mockNoteConfirmed).not.toHaveBeenCalled();
    s.getByTestId("confirm-panel-you-your-call");
    // PM29: Confirm and Dispute wait for the newer result (disabled, not busy); a press sends nothing.
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual({ disabled: true, busy: false });
    expect(s.getByTestId("confirm-dispute").props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
      fireEvent.press(s.getByTestId("confirm-dispute"));
    });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(s.queryByTestId("dispute-submit")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(onCompleted).not.toHaveBeenCalled();
    // The read with the newer count and its result: the plate, TK-RC1 and TK-RC2 change, and the buttons come back.
    s.rerender(
      <ConfirmStep
        {...props({ onCompleted, timekeeperResult: { editCount: 1, recordedByAdmin: false, result: { result: "submission", winnerId: "opp-1" } } })}
      />,
    );
    s.getByText("D. Okafor won");
    s.getByText("J. CRUZ CHANGED THE RESULT");
    expect(s.getByTestId("confirm-helper")).toHaveTextContent("Check it and confirm again.");
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual({ disabled: false, busy: false });
    expect(s.getByTestId("confirm-dispute").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("an edit landing between the tap and the reply keeps the athlete on confirm (A8)", async () => {
    jest.useFakeTimers();
    let reply: (v: unknown) => void = () => undefined;
    mockConfirm.mockReturnValue(new Promise((resolve) => (reply = resolve)));
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    // The confirm at count 0 is in flight; the timekeeper's edit lands (count 1, confirmations reset).
    s.rerender(<ConfirmStep {...props({ onCompleted, timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
    // The server took the confirm at 0 just before the edit deleted it.
    await act(async () => {
      reply({ ok: true, data: {} });
    });
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(onCompleted).not.toHaveBeenCalled();
    s.getByText("J. CRUZ CHANGED THE RESULT");
    s.getByTestId("confirm-panel-you-your-call");
    // Confirming again carries the new count.
    mockConfirm.mockResolvedValue({ ok: true, data: {} });
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    expect(mockConfirm).toHaveBeenLastCalledWith({ tag: "client" }, "M1", 1);
    act(() => {
      jest.advanceTimersByTime(1_500);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("a RESULT_CHANGED reply slower than the step's timer: the step never moves on; TK-RC4 and the confirm come back (A8)", async () => {
    jest.useFakeTimers();
    let reply: (v: unknown) => void = () => undefined;
    mockConfirm.mockReturnValue(new Promise((resolve) => (reply = resolve)));
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    // PM29: while the reply is out the row keeps WAITING ON YOU, Confirm is busy and Dispute disabled.
    s.getByTestId("confirm-panel-you-your-call");
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(s.getByTestId("confirm-dispute").props.accessibilityState).toMatchObject({ disabled: true });
    // The timekeeper's edit committed before the confirm reached the server, and no read of it has landed here.
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS + 500);
    });
    expect(onCompleted).not.toHaveBeenCalled();
    await act(async () => {
      reply({ ok: false, error: { code: "RESULT_CHANGED", message: "The result just changed" } });
    });
    expect(mockToast.info).toHaveBeenCalledWith({ text1: "The result just changed", description: "Check the new result, then confirm." });
    expect(mockReconcileNow).toHaveBeenCalledTimes(1);
    expect(mockNoteConfirmed).not.toHaveBeenCalled();
    s.getByTestId("confirm-panel-you-your-call");
    // No read with a newer count yet: Confirm waits for it (PM29).
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual({ disabled: true, busy: false });
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("an ok reply after 3 s: the step moves on exactly once, after the reply", async () => {
    jest.useFakeTimers();
    let reply: (v: unknown) => void = () => undefined;
    mockConfirm.mockReturnValue(new Promise((resolve) => (reply = resolve)));
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(onCompleted).not.toHaveBeenCalled();
    // PM29: no CONFIRMED before the server has it.
    s.getByTestId("confirm-panel-you-your-call");
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual({ disabled: true, busy: true });
    await act(async () => {
      reply({ ok: true, data: {} });
    });
    s.getByTestId("confirm-panel-you-confirmed");
    // The CONFIRMED row shows its full time once the server took the confirm.
    expect(onCompleted).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("a confirm queued offline moves on as one the server took", async () => {
    jest.useFakeTimers();
    mockConfirm.mockResolvedValue({ ok: true, data: { queued: true, key: "confirm-result:M1:me-1" } });
    mockIsQueued.mockReturnValue(true);
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    expect(mockToast.success).toHaveBeenCalledWith({ text1: "Saved locally", description: "Confirmation will sync when you're back online." });
    // Shipped: the queued confirm reads CONFIRMED, with no busy button left.
    s.getByTestId("confirm-panel-you-confirmed");
    expect(s.queryByTestId("confirm-result")).toBeNull();
    expect(s.queryByTestId("confirm-result-spinner")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS - 1);
    });
    expect(onCompleted).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("an edit after the confirm, before the step moved on, cancels the move (A8)", async () => {
    jest.useFakeTimers();
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    // A read straddling the edit still lists this athlete's (deleted) confirmation.
    s.rerender(
      <ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1"], timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />,
    );
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(onCompleted).not.toHaveBeenCalled();
    s.getByTestId("confirm-result");
  });

  it("an advance timer that fires after the edit's render, before its clean-up, still does not move (A8)", async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, "setTimeout");
    try {
      const onCompleted = jest.fn();
      const s = render(<ConfirmStep {...props({ onCompleted })} />);
      await act(async () => {
        fireEvent.press(s.getByTestId("confirm-result"));
      });
      // The move the confirm scheduled, kept to fire by hand.
      const scheduled = setTimeoutSpy.mock.calls.filter(([, ms]) => ms === ADVANCE_AFTER_CONFIRM_MS);
      expect(scheduled).toHaveLength(1);
      const fire = scheduled[0][0] as () => void;
      // The edit lands; its render's clean-up clears the timer...
      s.rerender(<ConfirmStep {...props({ onCompleted, timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
      // ...but a timer already due runs its callback first: it must find the confirm superseded.
      act(() => fire());
      expect(onCompleted).not.toHaveBeenCalled();
      s.getByTestId("confirm-result");
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("a confirmation known only from the DB's list: a read straddling an edit (the new count, the deleted confirmation) never moves on (A8)", () => {
    jest.useFakeTimers();
    const onCompleted = jest.fn();
    // Relaunched onto confirm: the DB lists this athlete's confirmation at count 0.
    const s = render(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1"] })} />);
    s.getByTestId("confirm-panel-you-confirmed");
    // The edit lands; the match read has count 1, the confirmations read (older) still lists the deleted confirmation.
    const straddle = ["me-1"];
    const edited = { editCount: 1, recordedByAdmin: false };
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: straddle, timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-you-your-call");
    // A re-render of that same read changes nothing.
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: straddle, timekeeperResult: edited })} />);
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(onCompleted).not.toHaveBeenCalled();
    s.getByTestId("confirm-result");
    // The next read is consistent: the confirmation is gone.
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: [], timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-you-your-call");
    // A later read lists a confirmation of the edited result (count 1 on both reads): it stands, and the step moves on.
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1"], timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-you-confirmed");
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("a confirmation known only from the DB's list: after a straddling read, the next read at the same count lists the confirmation of the edited result, and it moves on", () => {
    jest.useFakeTimers();
    const onCompleted = jest.fn();
    const edited = { editCount: 1, recordedByAdmin: false };
    const s = render(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1"] })} />);
    // The read that first shows the edit still lists the deleted confirmation.
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1"], timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-you-your-call");
    // Confirmed again (another device) before any read showed it gone: the next read, count 1 again, lists it.
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1"], timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-you-confirmed");
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("a confirmation the DB lists at the current count still moves on (the relaunch path, after an edit)", () => {
    jest.useFakeTimers();
    const onCompleted = jest.fn();
    const s = render(
      <ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1"], timekeeperResult: { editCount: 2, recordedByAdmin: false } })} />,
    );
    s.getByTestId("confirm-panel-you-confirmed");
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("an advance timer that fires after a straddling read's render, before its clean-up, still does not move (A8)", () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, "setTimeout");
    try {
      const onCompleted = jest.fn();
      const s = render(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1"] })} />);
      const scheduled = setTimeoutSpy.mock.calls.filter(([, ms]) => ms === ADVANCE_AFTER_CONFIRM_MS);
      expect(scheduled).toHaveLength(1);
      const fire = scheduled[0][0] as () => void;
      s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1"], timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
      act(() => fire());
      expect(onCompleted).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("confirm is a no-op once this athlete's confirmation stands", async () => {
    const onCompleted = jest.fn();
    const { result } = renderHook(() =>
      useConfirmResult({
        matchId: "M1",
        me: ME,
        opponent: { athleteId: "opp-1", displayName: "Demo Okafor" },
        confirmedAthleteIds: [],
        timekeeper: { editCount: 0, recorderName: "Jamal Cruz" },
        onCompleted,
      }),
    );
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.myConfirmed).toBe(true);
    await act(async () => {
      await result.current.confirm();
    });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it("any other refusal: Couldn't confirm with the guidance, never a DomainError message (M-R4, PM29)", async () => {
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "NOT_PARTICIPANT", message: "You are not a participant in this match." } });
    const s = render(<ConfirmStep {...props()} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Couldn't confirm", description: "Check your connection and try again." });
    expect(mockHapticError).toHaveBeenCalledTimes(1);
    expect(mockReconcileNow).toHaveBeenCalledTimes(1);
    s.getByTestId("confirm-panel-you-your-call");
    // The buttons come back.
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual({ disabled: false, busy: false });
    expect(s.getByTestId("confirm-dispute").props.accessibilityState).toMatchObject({ disabled: false });
  });
});

describe("PM29: an honest confirm press", () => {
  const RC4 = { text1: "The result just changed", description: "Check the new result, then confirm." };
  const FAILED = { text1: "Couldn't confirm", description: "Check your connection and try again." };
  const SENDING = { disabled: true, busy: true };
  const READY = { disabled: false, busy: false };
  const WAITING = { disabled: true, busy: false };
  const impact = () => (jest.requireMock("expo-haptics") as { impactAsync: jest.Mock }).impactAsync;
  const edited = (editCount: number, winnerId = "me-1") => ({ editCount, recordedByAdmin: false, result: { result: "submission" as const, winnerId } });

  /** A confirm whose reply this test hands back. */
  function deferReply() {
    let reply: (v: unknown) => void = () => undefined;
    mockConfirm.mockImplementation(() => new Promise((resolve) => (reply = resolve)));
    return (v: unknown) => act(async () => reply(v));
  }

  async function tapConfirm(s: ReturnType<typeof render>) {
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
  }

  it("sending: one call, Confirm busy with its spinner, Dispute disabled and inert, the row still WAITING ON YOU, a second tap sends nothing", async () => {
    jest.useFakeTimers();
    deferReply();
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await tapConfirm(s);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(SENDING);
    s.getByTestId("confirm-result-spinner");
    expect(s.getByTestId("confirm-dispute").props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(s.getByTestId("confirm-dispute"));
    expect(s.queryByTestId("dispute-submit")).toBeNull();
    expect(s.getByTestId("confirm-panel-you-your-call")).toHaveTextContent(/WAITING ON YOU/);
    expect(s.queryByText("CONFIRMED ✓")).toBeNull();
    await tapConfirm(s);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS * 2);
    });
    expect(impact()).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it.each([
    ["ok", { ok: true, data: {} }],
    ["already_confirmed", { ok: true, data: { already_confirmed: true } }],
  ])("an %s reply: CONFIRMED, the buttons gone, one haptic, and the verdict after exactly ADVANCE_AFTER_CONFIRM_MS", async (_name, reply) => {
    jest.useFakeTimers();
    const answer = deferReply();
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await tapConfirm(s);
    await answer(reply);
    s.getByTestId("confirm-panel-you-confirmed");
    s.getByText("CONFIRMED ✓");
    expect(s.queryByTestId("confirm-result")).toBeNull();
    expect(s.queryByTestId("confirm-dispute")).toBeNull();
    expect(impact()).toHaveBeenCalledTimes(1);
    expect(mockNoteConfirmed).toHaveBeenCalledWith("M1", "me-1", 0);
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS - 1);
    });
    expect(onCompleted).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("the ceiling: still sending just before it; at SEND_CEILING_MS with no reply, Couldn't confirm with the guidance and the buttons back", async () => {
    jest.useFakeTimers();
    const answer = deferReply();
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await tapConfirm(s);
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS - 1);
    });
    expect(SEND_CEILING_MS).toBe(20_000);
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(SENDING);
    expect(mockToast.error).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockToast.error).toHaveBeenCalledTimes(1);
    expect(mockToast.error).toHaveBeenCalledWith(FAILED);
    expect(mockHapticError).toHaveBeenCalledTimes(1);
    expect(mockReconcileNow).toHaveBeenCalledTimes(1);
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(READY);
    expect(s.getByTestId("confirm-dispute").props.accessibilityState).toMatchObject({ disabled: false });
    s.getByTestId("confirm-panel-you-your-call");

    // The ceiling dropped the late ok of that attempt (PM29 (1)): it changes
    // nothing (no haptic, no verdict, no CONFIRMED, no toast, no re-read) and
    // makes no TK-RC3 record (the athlete was told it failed; UX spec 3.4).
    await answer({ ok: true, data: {} });
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS * 2);
    });
    expect(impact()).not.toHaveBeenCalled();
    expect(mockNoteConfirmed).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledTimes(1);
    expect(mockReconcileNow).toHaveBeenCalledTimes(1);
    s.getByTestId("confirm-panel-you-your-call");

    // It did land: the reads list the confirmation at the current count, and the step moves on once.
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1"] })} />);
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1"] })} />);
    s.getByTestId("confirm-panel-you-confirmed");
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS * 4);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("a retry after the ceiling sends the count on screen and confirms", async () => {
    jest.useFakeTimers();
    deferReply();
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await tapConfirm(s);
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS);
    });
    mockConfirm.mockResolvedValue({ ok: true, data: { already_confirmed: true } });
    await tapConfirm(s);
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(mockConfirm).toHaveBeenLastCalledWith({ tag: "client" }, "M1", 0);
    s.getByTestId("confirm-panel-you-confirmed");
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  describe("the ceiling drops the older confirm's reply (m5r3 regression; PM29 (1)): it moves nothing and makes no TK-RC3 record", () => {
    /** Confirm replies this test hands back, in send order. */
    function deferReplies() {
      const replies: ((v: unknown) => void)[] = [];
      mockConfirm.mockImplementation(() => new Promise((resolve) => replies.push(resolve)));
      return (i: number, v: unknown) => act(async () => replies[i](v));
    }

    /** Confirm #1 at count 0 ends at the ceiling, the edit's read lands (count 1), and confirm #2 goes out at 1 while #1 is still unanswered. */
    async function twoConfirmsOut(onCompleted: jest.Mock) {
      const answer = deferReplies();
      const s = render(<ConfirmStep {...props({ onCompleted })} />);
      await tapConfirm(s);
      await act(async () => {
        jest.advanceTimersByTime(SEND_CEILING_MS);
      });
      expect(mockToast.error).toHaveBeenCalledWith(FAILED);
      s.rerender(<ConfirmStep {...props({ onCompleted, timekeeperResult: edited(1) })} />);
      await tapConfirm(s);
      expect(mockConfirm).toHaveBeenCalledTimes(2);
      expect(mockConfirm).toHaveBeenLastCalledWith({ tag: "client" }, "M1", 1);
      return { s, answer };
    }

    it("a stale ok reply that lands after the newer confirm's ok does not stop the move to the verdict", async () => {
      jest.useFakeTimers();
      const onCompleted = jest.fn();
      const { s, answer } = await twoConfirmsOut(onCompleted);
      // Confirm #2 (count 1) returns first, then the server's ok for #1 (it reached the server before the edit).
      await answer(1, { ok: true, data: {} });
      await answer(0, { ok: true, data: {} });
      s.getByTestId("confirm-panel-you-confirmed");
      expect(impact()).toHaveBeenCalledTimes(1);
      // The ceiling dropped #1's ok: only #2's confirm is in the TK-RC3 record.
      expect(mockNoteConfirmed.mock.calls).toEqual([["M1", "me-1", 1]]);
      act(() => {
        jest.advanceTimersByTime(10_000);
      });
      expect(onCompleted).toHaveBeenCalledTimes(1);
      expect(mockToast.info).not.toHaveBeenCalled();
    });

    it("a stale RESULT_CHANGED for the older confirm does not undo the newer one in flight", async () => {
      jest.useFakeTimers();
      const onCompleted = jest.fn();
      const { s, answer } = await twoConfirmsOut(onCompleted);
      const reads = mockReconcileNow.mock.calls.length;
      // #1 is refused as stale while #2 is still out: nothing changes.
      await answer(0, { ok: false, error: { code: "RESULT_CHANGED", message: "The result just changed" } });
      expect(mockToast.info).not.toHaveBeenCalled();
      expect(mockToast.error).toHaveBeenCalledTimes(1);
      expect(mockReconcileNow).toHaveBeenCalledTimes(reads);
      expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(SENDING);
      s.getByTestId("confirm-panel-you-your-call");
      // #2 is taken: CONFIRMED and the verdict, once.
      await answer(1, { ok: true, data: {} });
      s.getByTestId("confirm-panel-you-confirmed");
      expect(s.queryByTestId("confirm-result")).toBeNull();
      act(() => {
        jest.advanceTimersByTime(10_000);
      });
      expect(onCompleted).toHaveBeenCalledTimes(1);
      expect(mockNoteConfirmed.mock.calls).toEqual([["M1", "me-1", 1]]);
    });

    it("the older confirm's ok while the newer one is sending: the next read shows no TK-RC3, and Confirm stays busy", async () => {
      jest.useFakeTimers();
      const onCompleted = jest.fn();
      const { s, answer } = await twoConfirmsOut(onCompleted);
      // #1's late ok, then the step's next poll read (count 1, this athlete not listed).
      await answer(0, { ok: true, data: {} });
      s.rerender(<ConfirmStep {...props({ onCompleted, timekeeperResult: edited(1) })} />);
      expect(mockToast.info).not.toHaveBeenCalled();
      expect(mockNoteConfirmed).not.toHaveBeenCalled();
      expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(SENDING);
      s.getByTestId("confirm-panel-you-your-call");
      // #2 is taken: CONFIRMED and the verdict, once, and still no TK-RC3.
      await answer(1, { ok: true, data: {} });
      s.getByTestId("confirm-panel-you-confirmed");
      act(() => {
        jest.advanceTimersByTime(10_000);
      });
      expect(onCompleted).toHaveBeenCalledTimes(1);
      expect(mockToast.info).not.toHaveBeenCalled();
      expect(mockNoteConfirmed.mock.calls).toEqual([["M1", "me-1", 1]]);
    });

    it("the ok of a confirm the ceiling ended, then an edit: no TK-RC3 (the athlete was told it failed), and Confirm is back", async () => {
      jest.useFakeTimers();
      const onCompleted = jest.fn();
      const answer = deferReplies();
      const s = render(<ConfirmStep {...props({ onCompleted })} />);
      await tapConfirm(s);
      await act(async () => {
        jest.advanceTimersByTime(SEND_CEILING_MS);
      });
      expect(mockToast.error).toHaveBeenCalledWith(FAILED);
      // The edit's read lands, #1's late ok arrives, then the next read (count 1, not listed).
      s.rerender(<ConfirmStep {...props({ onCompleted, timekeeperResult: edited(1) })} />);
      await answer(0, { ok: true, data: {} });
      s.rerender(<ConfirmStep {...props({ onCompleted, timekeeperResult: edited(1) })} />);
      expect(mockToast.info).not.toHaveBeenCalled();
      expect(mockNoteConfirmed).not.toHaveBeenCalled();
      expect(impact()).not.toHaveBeenCalled();
      expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(READY);
      s.getByTestId("confirm-panel-you-your-call");
      act(() => {
        jest.advanceTimersByTime(10_000);
      });
      expect(onCompleted).not.toHaveBeenCalled();
    });
  });

  it("moved on (MATCH_NOT_PENDING: disputed or voided): no toast, no haptic, one re-read, the buttons back", async () => {
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "This match has already been started." } });
    const s = render(<ConfirmStep {...props()} />);
    await tapConfirm(s);
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockToast.info).not.toHaveBeenCalled();
    expect(mockHapticError).not.toHaveBeenCalled();
    expect(mockReconcileNow).toHaveBeenCalledTimes(1);
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(READY);
    expect(s.getByTestId("confirm-dispute").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("result changed, the newer read not in yet: TK-RC4 once, Confirm and Dispute disabled with no timer, until the newer read; then the press carries the new count", async () => {
    jest.useFakeTimers();
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "RESULT_CHANGED", message: "The result just changed" } });
    const s = render(<ConfirmStep {...props()} />);
    await tapConfirm(s);
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    expect(mockToast.info).toHaveBeenCalledWith(RC4);
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(WAITING);
    expect(s.getByTestId("confirm-dispute").props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS * 3);
    });
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(WAITING);
    // A read at the same count changes nothing.
    s.rerender(<ConfirmStep {...props({ confirmedAthleteIds: [] })} />);
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(WAITING);
    s.rerender(<ConfirmStep {...props({ timekeeperResult: edited(1, "opp-1") })} />);
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(READY);
    expect(s.getByTestId("confirm-dispute").props.accessibilityState).toMatchObject({ disabled: false });
    s.getByText("D. Okafor won");
    mockConfirm.mockResolvedValue({ ok: true, data: {} });
    await tapConfirm(s);
    expect(mockConfirm).toHaveBeenLastCalledWith({ tag: "client" }, "M1", 1);
    s.getByTestId("confirm-panel-you-confirmed");
  });

  it("result changed, the newer read already in (the edit landed while sending): the buttons are back at once, TK-RC4 once", async () => {
    jest.useFakeTimers();
    const answer = deferReply();
    const s = render(<ConfirmStep {...props()} />);
    await tapConfirm(s);
    s.rerender(<ConfirmStep {...props({ timekeeperResult: edited(1, "opp-1") })} />);
    // Still sending: the reply decides.
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(SENDING);
    await answer({ ok: false, error: { code: "RESULT_CHANGED", message: "The result just changed" } });
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    expect(mockToast.info).toHaveBeenCalledWith(RC4);
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(READY);
    expect(s.getByTestId("confirm-dispute").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("two edits, two refusals: TK-RC4 once per change, never twice for one", async () => {
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "RESULT_CHANGED", message: "The result just changed" } });
    const s = render(<ConfirmStep {...props()} />);
    await tapConfirm(s);
    await tapConfirm(s);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    s.rerender(<ConfirmStep {...props({ timekeeperResult: edited(1) })} />);
    await tapConfirm(s);
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(mockConfirm).toHaveBeenLastCalledWith({ tag: "client" }, "M1", 1);
    expect(mockToast.info).toHaveBeenCalledTimes(2);
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(WAITING);
    await tapConfirm(s);
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(mockToast.info).toHaveBeenCalledTimes(2);
  });

  it("the DB lists the confirmation while sending (a lost reply): CONFIRMED and the verdict; the later failure shows nothing", async () => {
    jest.useFakeTimers();
    const answer = deferReply();
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await tapConfirm(s);
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1"] })} />);
    s.getByTestId("confirm-panel-you-confirmed");
    expect(s.queryByTestId("confirm-result")).toBeNull();
    await answer({ ok: false, error: { code: "UNKNOWN", message: "network" } });
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockHapticError).not.toHaveBeenCalled();
    s.getByTestId("confirm-panel-you-confirmed");
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("the ceiling for a confirmation the DB already lists shows nothing", async () => {
    jest.useFakeTimers();
    deferReply();
    const s = render(<ConfirmStep {...props()} />);
    await tapConfirm(s);
    s.rerender(<ConfirmStep {...props({ confirmedAthleteIds: ["me-1"] })} />);
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS);
    });
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockHapticError).not.toHaveBeenCalled();
  });

  it("a thrown call is a failure like any other", async () => {
    mockConfirm.mockRejectedValue(new Error("boom"));
    // The real queue re-queues a throw; this one passes it on.
    const s = render(<ConfirmStep {...props()} />);
    await tapConfirm(s);
    expect(mockToast.error).toHaveBeenCalledWith(FAILED);
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual(READY);
  });

  it("the dispute form opened here is in timekeeper mode: a moved-on refusal brings the athlete back to confirm, with no toast, and re-reads", async () => {
    mockDispute.mockResolvedValue({ ok: false, error: { code: "ALREADY_DISPUTED", message: "This result has already been disputed." } });
    const s = render(<ConfirmStep {...props()} />);
    fireEvent.press(s.getByTestId("confirm-dispute"));
    await act(async () => {
      fireEvent.press(s.getByTestId("dispute-submit"));
    });
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockReconcileNow).toHaveBeenCalledTimes(1);
    s.getByTestId("confirm-result");
  });

  it("an edit while the dispute form is open: TK-RC4 there, and Back shows the new result", () => {
    const s = render(<ConfirmStep {...props()} />);
    fireEvent.press(s.getByTestId("confirm-dispute"));
    s.rerender(<ConfirmStep {...props({ timekeeperResult: edited(1, "opp-1") })} />);
    expect(mockToast.info).toHaveBeenCalledWith(RC4);
    fireEvent.press(s.getByTestId("dispute-back"));
    s.getByText("D. Okafor won");
    s.getByText("J. CRUZ CHANGED THE RESULT");
  });

  /** The hook alone, in timekeeper mode: its own guards, below the kit's busy and disabled states. */
  function tkHook(editCount = 0) {
    return renderHook(() =>
      useConfirmResult({
        matchId: "M1",
        me: ME,
        opponent: { athleteId: "opp-1", displayName: "Demo Okafor" },
        confirmedAthleteIds: [],
        timekeeper: { editCount, recorderName: "Jamal Cruz" },
        onCompleted: jest.fn(),
      }),
    );
  }

  it("two confirm() calls before the busy render send one confirm (the sending guard, not the button's busy state)", async () => {
    const answer = deferReply();
    const { result } = tkHook();
    const press = result.current.confirm;
    await act(async () => {
      void press();
      // Same render, so the same closure: only the in-flight ref can stop it.
      void press();
    });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(result.current.sending).toBe(true);
    await answer({ ok: true, data: {} });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(result.current.myConfirmed).toBe(true);
  });

  it("after RESULT_CHANGED at the same count, confirm() sends nothing until a newer read (the waiting guard, not the button's disabled state)", async () => {
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "RESULT_CHANGED", message: "The result just changed" } });
    const { result } = tkHook();
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.waitingForNewResult).toBe(true);
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.confirm();
    });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("unmounted while sending: the press leaves no timer behind", async () => {
    jest.useFakeTimers();
    deferReply();
    const { result, unmount } = renderHook(() =>
      useConfirmResult({
        matchId: "M1",
        me: ME,
        opponent: { athleteId: "opp-1", displayName: "Demo Okafor" },
        confirmedAthleteIds: [],
        timekeeper: { editCount: 0, recorderName: "Jamal Cruz" },
        onCompleted: jest.fn(),
      }),
    );
    const set = jest.spyOn(global, "setTimeout");
    const clear = jest.spyOn(global, "clearTimeout");
    try {
      await act(async () => {
        void result.current.confirm();
      });
      expect(result.current.sending).toBe(true);
      // The press's one timer: the ceiling.
      const ceilings = set.mock.results.filter((_r, i) => set.mock.calls[i][1] === SEND_CEILING_MS).map((r) => r.value);
      expect(ceilings).toHaveLength(1);
      expect(clear).not.toHaveBeenCalledWith(ceilings[0]);
      unmount();
      expect(clear).toHaveBeenCalledWith(ceilings[0]);
    } finally {
      set.mockRestore();
      clear.mockRestore();
    }
  });

  it("unmounted while sending: a reply, or the ceiling, then shows nothing", async () => {
    jest.useFakeTimers();
    const answer = deferReply();
    const s = render(<ConfirmStep {...props()} />);
    await tapConfirm(s);
    s.unmount();
    await answer({ ok: false, error: { code: "UNKNOWN", message: "network" } });
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS * 2);
    });
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockToast.info).not.toHaveBeenCalled();
    expect(mockHapticError).not.toHaveBeenCalled();
    expect(impact()).not.toHaveBeenCalled();
  });
});

describe("broadcasts only re-read (M-R8)", () => {
  it("the opponent's result_confirmed re-reads; only the read shows them confirmed, and an edit shows them WAITING again (B13 frame 4)", () => {
    const s = render(<ConfirmStep {...props()} />);
    act(() => mockSync.onResultConfirmed?.("opp-1"));
    expect(mockReconcileNow).toHaveBeenCalledTimes(1);
    s.getByTestId("confirm-panel-opponent-confirming");
    // The read lists the opponent's confirmation at count 0.
    s.rerender(<ConfirmStep {...props({ confirmedAthleteIds: ["opp-1"] })} />);
    s.getByTestId("confirm-panel-opponent-confirmed");
    // The timekeeper's edit: count 1, both confirmations deleted.
    s.rerender(<ConfirmStep {...props({ confirmedAthleteIds: [], timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
    s.getByText("J. CRUZ CHANGED THE RESULT");
    s.getByTestId("confirm-panel-opponent-confirming");
    expect(s.queryByText("D. OKAFOR CONFIRMED ✓")).toBeNull();
  });

  it("a read straddling an edit never shows the opponent's deleted confirmation", () => {
    const s = render(<ConfirmStep {...props({ confirmedAthleteIds: ["opp-1"] })} />);
    s.getByTestId("confirm-panel-opponent-confirmed");
    s.rerender(<ConfirmStep {...props({ confirmedAthleteIds: ["opp-1"], timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
    s.getByTestId("confirm-panel-opponent-confirming");
  });

  it("after a straddling read, the next read at the same count shows the opponent's confirmation of the edited result", () => {
    const edited = { editCount: 1, recordedByAdmin: false };
    const s = render(<ConfirmStep {...props({ confirmedAthleteIds: ["opp-1"] })} />);
    s.getByTestId("confirm-panel-opponent-confirmed");
    const straddle = ["opp-1"];
    s.rerender(<ConfirmStep {...props({ confirmedAthleteIds: straddle, timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-opponent-confirming");
    // A re-render of that same read changes nothing.
    s.rerender(<ConfirmStep {...props({ confirmedAthleteIds: straddle, timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-opponent-confirming");
    // The opponent confirmed the edited result before any read showed them absent: the next read (count 1 again) lists it.
    s.rerender(<ConfirmStep {...props({ confirmedAthleteIds: ["opp-1"], timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-opponent-confirmed");
    s.getByText("D. OKAFOR CONFIRMED ✓");
  });

  it("a count that moves with no new list (confirmations unread, or a match-only refresh): the old list never stands, and the next list is held to the lower count", () => {
    const listed = ["opp-1"];
    const edited = { editCount: 1, recordedByAdmin: false };
    const s = render(<ConfirmStep {...props({ confirmedAthleteIds: listed })} />);
    s.getByTestId("confirm-panel-opponent-confirmed");
    s.rerender(<ConfirmStep {...props({ confirmedAthleteIds: listed, timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-opponent-confirming");
    // The first list since may have been sent before the edit landed (a refresh is not one of the reconciler's serialized reads).
    s.rerender(<ConfirmStep {...props({ confirmedAthleteIds: ["opp-1"], timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-opponent-confirming");
    // The list after it was read once a list at count 1 was in: it stands.
    s.rerender(<ConfirmStep {...props({ confirmedAthleteIds: ["opp-1"], timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-opponent-confirmed");
  });

  it("a poll at the same count, then a count move with no new list: the next list is still held to the lower count", () => {
    jest.useFakeTimers();
    const onCompleted = jest.fn();
    const edited = { editCount: 1, recordedByAdmin: false };
    const s = render(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1", "opp-1"] })} />);
    s.getByTestId("confirm-panel-opponent-confirmed");
    // The next poll at count 0: the same confirmations (equal credits), a new list.
    const poll = ["me-1", "opp-1"];
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: poll })} />);
    s.getByTestId("confirm-panel-opponent-confirmed");
    // The count moves with no new list (a match-only refresh): that poll is still the read in hand.
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: poll, timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-opponent-confirming");
    s.getByTestId("confirm-panel-you-your-call");
    // The first list since may straddle the edit: held to count 0, so neither deleted confirmation stands.
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1", "opp-1"], timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-opponent-confirming");
    s.getByTestId("confirm-panel-you-your-call");
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(onCompleted).not.toHaveBeenCalled();
    // The list after it was read once a list at count 1 was in: it stands.
    s.rerender(<ConfirmStep {...props({ onCompleted, confirmedAthleteIds: ["me-1", "opp-1"], timekeeperResult: edited })} />);
    s.getByTestId("confirm-panel-opponent-confirmed");
    s.getByTestId("confirm-panel-you-confirmed");
  });

  it("a caller that hands a fresh but equal list on every render settles (no render loop)", () => {
    const { result, rerender } = renderHook(() =>
      useConfirmResult({
        matchId: "M1",
        me: ME,
        opponent: { athleteId: "opp-1", displayName: "Demo Okafor" },
        confirmedAthleteIds: ["opp-1"],
        timekeeper: { editCount: 0, recorderName: "Jamal Cruz" },
        onCompleted: jest.fn(),
      }),
    );
    expect(result.current.opponentConfirmed).toBe(true);
    rerender({});
    rerender({});
    expect(result.current.opponentConfirmed).toBe(true);
    expect(result.current.myConfirmed).toBe(false);
  });

  it("a broadcast heard before an edit never shows the opponent confirmed after it", () => {
    const s = render(<ConfirmStep {...props()} />);
    act(() => mockSync.onResultConfirmed?.("opp-1"));
    s.rerender(<ConfirmStep {...props({ timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
    s.getByTestId("confirm-panel-opponent-confirming");
  });

  it("the opponent's match_disputed re-reads and moves nothing: no toast, no verdict (the read moves the wizard)", () => {
    jest.useFakeTimers();
    const onCompleted = jest.fn();
    render(<ConfirmStep {...props({ onCompleted })} />);
    act(() => mockSync.onMatchDisputed?.("opp-1"));
    expect(mockReconcileNow).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(onCompleted).not.toHaveBeenCalled();
    expect(mockToast.info).not.toHaveBeenCalled();
  });
});

describe("a dispute after a superseded confirm", () => {
  it("still leaves for the verdict (the A8 guard holds only the confirm-driven move)", async () => {
    jest.useFakeTimers();
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ onCompleted })} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    // The edit lands before the move: count 1, this confirmation gone.
    s.rerender(<ConfirmStep {...props({ onCompleted, timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(onCompleted).not.toHaveBeenCalled();
    fireEvent.press(s.getByTestId("confirm-dispute"));
    await act(async () => {
      fireEvent.press(s.getByTestId("dispute-submit"));
    });
    await act(async () => {
      jest.advanceTimersByTime(1_500);
    });
    expect(mockDispute).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });
});

describe("TK-RC3 (the confirmation an edit reset)", () => {
  const RC3 = { text1: "Result changed", description: "J. Cruz corrected the result. Confirm it again." };

  async function confirmThenLeave(overrides: Partial<StepProps> = {}) {
    const first = render(<ConfirmStep {...props(overrides)} />);
    await act(async () => {
      fireEvent.press(first.getByTestId("confirm-result"));
    });
    // On to the verdict: the confirm step unmounts.
    first.unmount();
  }

  it("once, when the wizard brings the athlete back to confirm after an edit; never again for that edit", async () => {
    await confirmThenLeave();
    expect(mockToast.info).not.toHaveBeenCalled();
    // The edit: count 1, confirmations deleted; the wizard is back on confirm.
    const back = render(<ConfirmStep {...props({ timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    expect(mockToast.info).toHaveBeenCalledWith(RC3);
    back.getByText("J. CRUZ CHANGED THE RESULT");
    // A re-read of the same edit, or a remount, says nothing more.
    back.rerender(<ConfirmStep {...props({ confirmedAthleteIds: ["opp-1"], timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
    back.unmount();
    render(<ConfirmStep {...props({ timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
    expect(mockToast.info).toHaveBeenCalledTimes(1);
  });

  it("while still on confirm (the edit lands before the move): once", async () => {
    const s = render(<ConfirmStep {...props()} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    s.rerender(<ConfirmStep {...props({ timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    expect(mockToast.info).toHaveBeenCalledWith(RC3);
  });

  it("not for an athlete who had not confirmed: the header says it (TK-RC1)", () => {
    const s = render(<ConfirmStep {...props()} />);
    s.rerender(<ConfirmStep {...props({ timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
    expect(mockToast.info).not.toHaveBeenCalled();
    s.getByText("J. CRUZ CHANGED THE RESULT");
  });

  it("a blank timekeeper name: the title and TK-RC2, never a blank name", async () => {
    await confirmThenLeave({ recorderName: "  " });
    render(<ConfirmStep {...props({ recorderName: "  ", timekeeperResult: { editCount: 1, recordedByAdmin: false } })} />);
    expect(mockToast.info).toHaveBeenCalledWith({ text1: "Result changed", description: "Check it and confirm again." });
  });

  it("never in a two-athlete match", async () => {
    const twoAthlete = { recorderName: undefined, timekeeperResult: undefined };
    await confirmThenLeave(twoAthlete);
    const s = render(<ConfirmStep {...props({ ...twoAthlete, confirmedAthleteIds: ["me-1"] })} />);
    s.rerender(<ConfirmStep {...props({ ...twoAthlete, confirmedAthleteIds: [] })} />);
    expect(mockToast.info).not.toHaveBeenCalled();
  });
});

describe("the result shown", () => {
  it("timekeeper mode: the result as the match has it now, not this phone's first copy (A8)", () => {
    // This phone heard ME won; the timekeeper's edit made OPP the winner.
    const s = render(
      <ConfirmStep
        {...props({
          resultData: { result: "submission", winnerId: "me-1" },
          timekeeperResult: { editCount: 1, recordedByAdmin: false, result: { result: "submission", winnerId: "opp-1" } },
        })}
      />,
    );
    s.getByText("D. Okafor won");
    expect(s.getByTestId("confirm-verdict")).toHaveTextContent("YOU LOST");
  });

  it("before the result is read, this phone's copy stands in", () => {
    const s = render(<ConfirmStep {...props({ timekeeperResult: { editCount: 0, recordedByAdmin: false, result: null } })} />);
    s.getByText("M. Park won");
  });
});

describe("the two-athlete confirm is unchanged", () => {
  it("calls the shipped confirm (no count) and keeps its error description", async () => {
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "nope" } });
    const s = render(<ConfirmStep {...props({ recorderName: undefined, timekeeperResult: undefined, matchLengthSeconds: null })} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    expect(mockConfirm).toHaveBeenCalledWith({ tag: "client" }, "M1");
    expect(mockConfirm.mock.calls[0]).toHaveLength(2);
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Couldn't confirm", description: "nope" });
    expect(mockNoteConfirmed).not.toHaveBeenCalled();
  });

  it("its dispute form is the shipped one: a refusal keeps the error's message and the form", async () => {
    mockDispute.mockResolvedValue({ ok: false, error: { code: "ALREADY_DISPUTED", message: "This result has already been disputed." } });
    const s = render(<ConfirmStep {...props({ recorderName: undefined, timekeeperResult: undefined })} />);
    fireEvent.press(s.getByTestId("confirm-dispute"));
    await act(async () => {
      fireEvent.press(s.getByTestId("dispute-submit"));
    });
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Couldn't dispute", description: "This result has already been disputed." });
    s.getByTestId("dispute-submit");
    expect(mockReconcileNow).not.toHaveBeenCalled();
  });

  it("is never busy, and never toasts at the ceiling (PM29 is timekeeper mode only)", async () => {
    jest.useFakeTimers();
    mockConfirm.mockReturnValue(new Promise(() => undefined));
    const s = render(<ConfirmStep {...props({ recorderName: undefined, timekeeperResult: undefined })} />);
    expect(s.getByTestId("confirm-result").props.accessibilityState).toEqual({ disabled: false, busy: false });
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    // The two-athlete row flips at the tap, as shipped.
    s.getByTestId("confirm-panel-you-confirmed");
    expect(s.queryByTestId("confirm-result-spinner")).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS * 2);
    });
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockHapticError).not.toHaveBeenCalled();
  });

  it("moves on from the tap, before the reply, as shipped", async () => {
    jest.useFakeTimers();
    mockConfirm.mockReturnValue(new Promise(() => undefined));
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ recorderName: undefined, timekeeperResult: undefined, onCompleted })} />);
    await act(async () => {
      fireEvent.press(s.getByTestId("confirm-result"));
    });
    act(() => {
      jest.advanceTimersByTime(ADVANCE_AFTER_CONFIRM_MS);
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("hears the opponent's confirm and dispute by broadcast, as shipped", () => {
    const onCompleted = jest.fn();
    const s = render(<ConfirmStep {...props({ recorderName: undefined, timekeeperResult: undefined, onCompleted })} />);
    act(() => mockSync.onResultConfirmed?.("opp-1"));
    s.getByTestId("confirm-panel-opponent-confirmed");
    s.getByText("RESULT RECORDED BY D. OKAFOR");
    act(() => mockSync.onMatchDisputed?.("opp-1"));
    expect(mockToast.info).toHaveBeenCalledWith({ text1: "Result disputed", description: "Demo Okafor disputed the result. An admin will review it." });
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(mockReconcileNow).not.toHaveBeenCalled();
  });

  it("still names the opponent once their confirmation shows", () => {
    const s = render(
      <ConfirmStep {...props({ recorderName: undefined, timekeeperResult: undefined, confirmedAthleteIds: ["opp-1"] })} />,
    );
    s.getByText("RESULT RECORDED BY D. OKAFOR");
  });

  it("never reads or writes the TK-RC3 record on the device, even with this athlete listed as confirmed (M-R5)", async () => {
    (AsyncStorage.getItem as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();
    const twoAthlete = { recorderName: undefined, timekeeperResult: undefined };
    const s = render(<ConfirmStep {...props({ ...twoAthlete, confirmedAthleteIds: ["me-1"] })} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    s.rerender(<ConfirmStep {...props({ ...twoAthlete, confirmedAthleteIds: ["me-1", "opp-1"] })} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
