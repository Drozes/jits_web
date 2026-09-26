/**
 * THE DEFECT: the confirm step ("match-summary") advanced on `matches.status
 * === 'completed'`, both from the realtime row event and on mount. But
 * record_match_result sets `completed` at RECORD time, before anyone has
 * confirmed, so once `matches` joined the realtime publication every
 * athlete was skipped past confirmation and dispute.
 *
 * These tests pin the replacement: the step finishes only when the match is
 * disputed or BOTH athletes have a confirmation row; a `completed` row event
 * is just a trigger to re-read the DB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";

type RowHandler = (p: { new: { status?: string } }) => void;
const rowListener: { handler: RowHandler | null } = { handler: null };

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => {
      const chan: Record<string, unknown> = {};
      chan.on = (_e: string, _f: unknown, h: RowHandler) => {
        rowListener.handler = h;
        return chan;
      };
      chan.subscribe = () => chan;
      return chan;
    },
    removeChannel: vi.fn(),
  }),
}));

const mockToastError = vi.fn<(...a: unknown[]) => string>(() => "toast-1");
const mockToastDismiss = vi.fn();
const mockToastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => mockToastError(...a),
    info: (...a: unknown[]) => mockToastInfo(...a),
    dismiss: (...a: unknown[]) => mockToastDismiss(...a),
    success: vi.fn(),
  },
}));

const mockConfirm = vi.fn();
const mockDispute = vi.fn();
vi.mock("@jits/shared/api/mutations", () => ({
  confirmMatchResult: (...a: unknown[]) => mockConfirm(...a),
  disputeMatchResult: (...a: unknown[]) => mockDispute(...a),
}));

const mockDetails = vi.fn();
const mockConfirmations = vi.fn();
vi.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockDetails(...a),
  getMatchConfirmations: (...a: unknown[]) => mockConfirmations(...a),
}));

type SyncParams = { onMatchDisputed?: (id: string) => void; onResultConfirmed?: (id: string) => void };
let syncParams: SyncParams = {};
const mockBroadcastDisputed = vi.fn<(id: string) => Promise<string>>(async () => "ok");
const mockBroadcastConfirmed = vi.fn<(id: string) => Promise<string>>(async () => "ok");
vi.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (p: SyncParams) => {
    syncParams = p;
    return {
      broadcastResultConfirmed: mockBroadcastConfirmed,
      broadcastMatchDisputed: mockBroadcastDisputed,
    };
  },
}));

import {
  DISPUTE_FAILED_MESSAGE,
  LEAVE_AFTER_MS,
  MatchSummaryStep,
  isConfirmStepDone,
  opponentDisputedMessage,
} from "./match-summary-step";

const ME = "me-1";
const OPP = "opp-1";

function renderStep(matchStatus = "completed") {
  const onNext = vi.fn();
  const view = render(
    <MatchSummaryStep
      onNext={onNext}
      matchId="M1"
      matchType="ranked"
      matchStatus={matchStatus}
      currentAthleteId={ME}
      opponent={{ id: OPP, displayName: "Opponent" }}
      resultData={{ result: "submission", winnerId: ME }}
    />,
  );
  return { onNext, ...view };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  rowListener.handler = null;
  syncParams = {};
  mockDetails.mockResolvedValue({ id: "M1", status: "completed" });
  mockConfirmations.mockResolvedValue([]);
  mockConfirm.mockResolvedValue({ ok: true, data: {} });
  mockDispute.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isConfirmStepDone", () => {
  it("is false for completed with zero or one confirmation", () => {
    expect(isConfirmStepDone("completed", [], ME, OPP)).toBe(false);
    expect(isConfirmStepDone("completed", [ME], ME, OPP)).toBe(false);
    expect(isConfirmStepDone("completed", [OPP], ME, OPP)).toBe(false);
    expect(isConfirmStepDone("completed", null, ME, OPP)).toBe(false);
  });
  it("is true when both confirmed, or disputed", () => {
    expect(isConfirmStepDone("completed", [OPP, ME], ME, OPP)).toBe(true);
    expect(isConfirmStepDone("disputed", [], ME, OPP)).toBe(true);
  });
});

describe("MatchSummaryStep (web confirm step)", () => {
  it("does NOT advance on mount just because the match is already completed", async () => {
    const { onNext, getByText } = renderStep("completed");
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(onNext).not.toHaveBeenCalled();
    getByText("Confirm Result");
  });

  it("does NOT advance on a realtime 'completed' UPDATE with zero confirmations", async () => {
    const { onNext } = renderStep();
    await flush();
    act(() => rowListener.handler?.({ new: { status: "completed" } }));
    await flush();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("does NOT advance on a realtime 'completed' UPDATE with only one confirmation", async () => {
    const { onNext } = renderStep();
    await flush();
    mockConfirmations.mockResolvedValue([OPP]);
    act(() => rowListener.handler?.({ new: { status: "completed" } }));
    await flush();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("advances when the DB shows both confirmations", async () => {
    const { onNext } = renderStep();
    await flush();
    mockConfirmations.mockResolvedValue([ME, OPP]);
    act(() => rowListener.handler?.({ new: { status: "completed" } }));
    await flush();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("advances on a realtime 'disputed' UPDATE", async () => {
    const { onNext } = renderStep();
    await flush();
    act(() => rowListener.handler?.({ new: { status: "disputed" } }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("advances when the opponent's match_disputed broadcast arrives, not on its own echo", async () => {
    const { onNext } = renderStep();
    await flush();
    act(() => syncParams.onMatchDisputed?.(ME));
    expect(onNext).not.toHaveBeenCalled();
    act(() => syncParams.onMatchDisputed?.(OPP));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("tells the athlete their opponent disputed, once", async () => {
    renderStep();
    await flush();
    act(() => syncParams.onMatchDisputed?.(ME));
    expect(mockToastInfo).not.toHaveBeenCalled();
    act(() => syncParams.onMatchDisputed?.(OPP));
    act(() => rowListener.handler?.({ new: { status: "disputed" } }));
    expect(mockToastInfo).toHaveBeenCalledTimes(1);
    expect(mockToastInfo).toHaveBeenCalledWith(opponentDisputedMessage("Opponent"));
  });

  it("also says so when only the 'disputed' row event arrives", async () => {
    const { onNext } = renderStep();
    await flush();
    act(() => rowListener.handler?.({ new: { status: "disputed" } }));
    expect(mockToastInfo).toHaveBeenCalledWith(
      "Opponent disputed the result. An admin will review it.",
    );
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("the disputer's own row event is not toasted as the opponent's", async () => {
    let finish!: (v: unknown) => void;
    mockDispute.mockReturnValue(new Promise((r) => (finish = r)));
    const { onNext, getByText } = renderStep();
    await flush();
    await act(async () => {
      fireEvent.click(getByText("Dispute result"));
    });
    act(() => rowListener.handler?.({ new: { status: "disputed" } }));
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ ok: true, data: {} });
    });
    await flush();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("a failed dispute stays on the step, toasts, and lets the athlete choose again", async () => {
    mockDispute.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "" } });
    const { onNext, getByText } = renderStep();
    await flush();
    await act(async () => {
      fireEvent.click(getByText("Dispute result"));
    });
    await flush();
    expect(mockToastError).toHaveBeenCalledWith(DISPUTE_FAILED_MESSAGE);
    expect(mockBroadcastDisputed).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    getByText("Dispute result");
    getByText("Confirm Result");
  });

  it("a failed dispute shows the mapped message when there is one", async () => {
    mockDispute.mockResolvedValue({
      ok: false,
      error: { code: "RLS_VIOLATION", message: "You can't dispute this match." },
    });
    const { getByText } = renderStep();
    await flush();
    await act(async () => {
      fireEvent.click(getByText("Dispute result"));
    });
    await flush();
    expect(mockToastError).toHaveBeenCalledWith("You can't dispute this match.");
  });

  it("a waiting confirmer's poll catches a missed result_confirmed, once", async () => {
    const { onNext, getByText } = renderStep();
    await flush();
    await act(async () => {
      fireEvent.click(getByText("Confirm Result"));
    });
    await flush();
    getByText("Waiting for opponent to confirm...");
    mockConfirmations.mockResolvedValue([ME, OPP]);
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("the disputer broadcasts match_disputed before advancing", async () => {
    const { onNext, getByText } = renderStep();
    await flush();
    await act(async () => {
      fireEvent.click(getByText("Dispute result"));
    });
    await flush();
    expect(mockBroadcastDisputed).toHaveBeenCalledWith(ME);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("offers 'Continue without waiting' only 20s after confirming, and it advances", async () => {
    const { onNext, getByText, queryByText } = renderStep();
    await flush();
    await act(async () => {
      fireEvent.click(getByText("Confirm Result"));
    });
    await flush();
    expect(queryByText("Continue without waiting")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(LEAVE_AFTER_MS - 1);
    });
    expect(queryByText("Continue without waiting")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await act(async () => {
      fireEvent.click(getByText("Continue without waiting"));
    });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("a failed confirm advances when the DB shows the match disputed, with no error", async () => {
    const { onNext, getByText } = renderStep();
    await flush();
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    mockDetails.mockResolvedValue({ id: "M1", status: "disputed" });
    await act(async () => {
      fireEvent.click(getByText("Confirm Result"));
    });
    await flush();
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("a failed confirm whose row did land shows the waiting state, with no error", async () => {
    const { onNext, getByText, queryByText } = renderStep();
    await flush();
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    mockConfirmations.mockResolvedValue([ME]);
    await act(async () => {
      fireEvent.click(getByText("Confirm Result"));
    });
    await flush();
    getByText("Waiting for opponent to confirm...");
    expect(queryByText("Confirm Result")).toBeNull();
    expect(queryByText("Dispute result")).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockBroadcastConfirmed).toHaveBeenCalledWith(ME);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("a failed confirm the DB does not explain shows the error with a retry", async () => {
    const { onNext, getByText } = renderStep();
    await flush();
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    await act(async () => {
      fireEvent.click(getByText("Confirm Result"));
    });
    await flush();
    expect(onNext).not.toHaveBeenCalled();
    getByText("Confirm Result");
    expect(mockToastError).toHaveBeenCalledTimes(1);
    const opts = mockToastError.mock.calls[0][1] as { action: { label: string; onClick: () => void } };
    expect(opts.action.label).toBe("Retry");
    mockConfirm.mockResolvedValue({ ok: true, data: {} });
    await act(async () => {
      opts.action.onClick();
    });
    await flush();
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-1");
    getByText("Waiting for opponent to confirm...");
  });

  it("the Confirm/Dispute buttons do not flash back while a failed confirm re-checks the DB", async () => {
    const { getByText, queryByText } = renderStep();
    await flush();
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    let resolveConfirmations: (v: string[]) => void = () => {};
    mockConfirmations.mockReturnValue(new Promise<string[]>((r) => { resolveConfirmations = r; }));
    await act(async () => {
      fireEvent.click(getByText("Confirm Result"));
    });
    await flush();
    expect(queryByText("Confirm Result")).toBeNull();
    expect(queryByText("Dispute result")).toBeNull();
    await act(async () => {
      resolveConfirmations([]);
    });
    await flush();
    getByText("Confirm Result");
  });

  it("a retried confirm restarts the 20s leave clock", async () => {
    const { getByText, queryByText } = renderStep();
    await flush();
    let resolveConfirm: (v: unknown) => void = () => {};
    mockConfirm.mockReturnValueOnce(new Promise((r) => { resolveConfirm = r; }));
    await act(async () => {
      fireEvent.click(getByText("Confirm Result"));
    });
    await act(async () => {
      vi.advanceTimersByTime(LEAVE_AFTER_MS);
    });
    getByText("Continue without waiting");
    // The slow confirm finally fails and the DB does not explain it.
    await act(async () => {
      resolveConfirm({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    });
    await flush();
    expect(queryByText("Continue without waiting")).toBeNull();
    await act(async () => {
      fireEvent.click(getByText("Confirm Result"));
    });
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(LEAVE_AFTER_MS - 1);
    });
    expect(queryByText("Continue without waiting")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    getByText("Continue without waiting");
  });

  it("the leave link disappears once the opponent's result_confirmed arrives", async () => {
    const { getByText, queryByText } = renderStep();
    await flush();
    await act(async () => {
      fireEvent.click(getByText("Confirm Result"));
    });
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(LEAVE_AFTER_MS);
    });
    getByText("Continue without waiting");
    act(() => syncParams.onResultConfirmed?.(OPP));
    expect(queryByText("Continue without waiting")).toBeNull();
  });

  it("dismisses the Retry toast when the step advances", async () => {
    const { getByText } = renderStep();
    await flush();
    mockConfirm.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    await act(async () => {
      fireEvent.click(getByText("Confirm Result"));
    });
    await flush();
    expect(mockToastError).toHaveBeenCalledTimes(1);
    act(() => rowListener.handler?.({ new: { status: "disputed" } }));
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-1");
  });
});
