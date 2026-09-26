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

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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
const mockBroadcastDisputed = vi.fn(async (_id: string) => "ok");
vi.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (p: SyncParams) => {
    syncParams = p;
    return {
      broadcastResultConfirmed: vi.fn(async () => "ok"),
      broadcastMatchDisputed: mockBroadcastDisputed,
    };
  },
}));

import { MatchSummaryStep, isConfirmStepDone } from "./match-summary-step";

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
});
