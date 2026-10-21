/**
 * The self-run start policy on its own (`useDualAutoStart`, timekeeper mode
 * ARCHITECTURE 2.3 "Start policy"; owner decision A29). The face-off tests
 * reach it through the whole face-off; these pin the hook's own inputs and
 * edges that the face-off cannot reach on its own:
 *  - `enabled` false (timekeeper mode's caps) never calls `start_match`, even
 *    with both athletes ready and the weight gate open; the default does;
 *  - a retry attempt refused by the weight gate goes back to the checks, and
 *    the next ready is a new run (its own attempts, its own toast);
 *  - a retry attempt that lost the race follows the DB's started match;
 *  - `stop()` (Leave's) ends a failed run between attempts, and does nothing
 *    with no failure or with a call in flight.
 */
import * as React from "react";
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
const mockStart = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({ startMatch: (...a: unknown[]) => mockStart(...a) }));
const mockGetMatchDetails = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({ getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a) }));

import { toast } from "@/components/ui/toast";
import { MAX_START_ATTEMPTS, START_RETRY_BACKOFF_MS, useDualAutoStart } from "@/lib/match-flow/use-dual-auto-start";

const REFUSED = { ok: false, error: { code: "UNKNOWN", message: "Match is not pending" } };
const GATED = { ok: false, error: { code: "WEIGHT_FLAGGED", message: "Weight flagged" } };
const NOT_STARTED = { id: "M1", status: "pending", started_at: null };
const STARTED_AT = "2026-10-21T12:00:03.000Z";

interface Inputs {
  enabled?: boolean;
  opponentReady: boolean;
  canStart: boolean;
}

/**
 * The hook as `useFaceoff` composes it: this athlete's ready is local state,
 * set by a tap and cleared by the weight gate and by giving up (`onWeightGate`,
 * `onGaveUp`), so a refusal never leaves ready set behind the hook's back.
 */
function setup(initial: Inputs & { myReady: boolean }) {
  const startedRef = { current: false };
  const cancelledRef = { current: false };
  const onStarted = jest.fn();
  const onWeightGate = jest.fn();
  const onGaveUp = jest.fn();
  const broadcastTimerStarted = jest.fn(() => Promise.resolve("ok"));
  const hook = renderHook(
    (i: Inputs) => {
      const [myReady, setMyReady] = React.useState(initial.myReady);
      const start = useDualAutoStart({
        matchId: "M1",
        ...i,
        myReady,
        startedRef,
        cancelledRef,
        broadcastTimerStarted,
        onStarted,
        onWeightGate: () => {
          onWeightGate();
          setMyReady(false);
        },
        onGaveUp: () => {
          onGaveUp();
          setMyReady(false);
        },
      });
      return { ...start, myReady, tapReady: () => setMyReady(true) };
    },
    { initialProps: initial },
  );
  return { ...hook, startedRef, cancelledRef, onStarted, onWeightGate, onGaveUp, broadcastTimerStarted };
}

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await settle();
}

const BOTH_READY: Inputs & { myReady: boolean } = { myReady: true, opponentReady: true, canStart: true };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockGetMatchDetails.mockResolvedValue(NOT_STARTED);
});
afterEach(() => {
  jest.useRealTimers();
});

describe("the start policy input (enabled)", () => {
  it("false never calls start_match, with both ready and the weight gate open", async () => {
    mockStart.mockResolvedValue({ ok: true, data: { started_at: STARTED_AT } });
    const h = setup({ ...BOTH_READY, enabled: false });
    await advance(30_000);
    expect(mockStart).not.toHaveBeenCalled();
    expect(h.result.current.starting).toBe(false);
    expect(h.onStarted).not.toHaveBeenCalled();
  });

  it("the default (and true) calls it once, and announces the start", async () => {
    for (const enabled of [undefined, true]) {
      jest.clearAllMocks();
      mockStart.mockResolvedValue({ ok: true, data: { started_at: STARTED_AT } });
      const h = setup({ ...BOTH_READY, enabled });
      await settle();
      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(h.broadcastTimerStarted).toHaveBeenCalledWith(STARTED_AT);
      expect(h.onStarted).toHaveBeenCalledWith(STARTED_AT);
      h.unmount();
    }
  });

  it("switching it off mid-run stops the next attempt", async () => {
    mockStart.mockResolvedValue(REFUSED);
    const h = setup(BOTH_READY);
    await settle();
    expect(mockStart).toHaveBeenCalledTimes(1);
    h.rerender({ opponentReady: true, canStart: true, enabled: false });
    await advance(10_000);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});

describe("a retry attempt (A29)", () => {
  it("refused by the weight gate: back to the checks, and the next ready is a new run with its own toast", async () => {
    mockStart.mockResolvedValueOnce(REFUSED).mockResolvedValueOnce(GATED).mockResolvedValue(REFUSED);
    const h = setup(BOTH_READY);
    await settle();
    expect(toast.error).toHaveBeenCalledTimes(1);
    await advance(START_RETRY_BACKOFF_MS[0]);
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(h.onWeightGate).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith({ text1: "Match on hold", description: "Weight flagged" });
    expect(h.onGaveUp).not.toHaveBeenCalled();
    expect(h.startedRef.current).toBe(false);
    // Ready is cleared on the gate; nothing more is called meanwhile.
    expect(h.result.current.myReady).toBe(false);
    await advance(10_000);
    expect(mockStart).toHaveBeenCalledTimes(2);
    // A fresh ready is a new run: an attempt at once, and its first failure toasts again.
    act(() => h.result.current.tapReady());
    await settle();
    expect(mockStart).toHaveBeenCalledTimes(3);
    expect(toast.error).toHaveBeenCalledTimes(2);
    // And that run keeps the full bound of its own.
    await advance(START_RETRY_BACKOFF_MS[0]);
    await advance(START_RETRY_BACKOFF_MS[1]);
    expect(mockStart).toHaveBeenCalledTimes(2 + MAX_START_ATTEMPTS);
    expect(h.onGaveUp).toHaveBeenCalledTimes(1);
  });

  it("that lost the race follows the DB's started match, with no second toast and no further call", async () => {
    mockStart.mockResolvedValue(REFUSED);
    mockGetMatchDetails.mockResolvedValueOnce(NOT_STARTED).mockResolvedValue({ id: "M1", status: "in_progress", started_at: STARTED_AT });
    const h = setup(BOTH_READY);
    await settle();
    expect(toast.error).toHaveBeenCalledTimes(1);
    await advance(START_RETRY_BACKOFF_MS[0]);
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(h.onStarted).toHaveBeenCalledWith(STARTED_AT);
    // The loser does not re-announce the winner's start.
    expect(h.broadcastTimerStarted).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    await advance(30_000);
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(h.onGaveUp).not.toHaveBeenCalled();
  });
});

describe("stop() (Leave during a failed run)", () => {
  it("between attempts: no retry, and ready is given up", async () => {
    mockStart.mockResolvedValue(REFUSED);
    const h = setup(BOTH_READY);
    await settle();
    expect(mockStart).toHaveBeenCalledTimes(1);
    act(() => h.result.current.stop());
    expect(h.onGaveUp).toHaveBeenCalledTimes(1);
    expect(h.result.current.myReady).toBe(false);
    await advance(30_000);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(h.startedRef.current).toBe(false);
  });

  it("with no failure: nothing (the shipped Leave)", async () => {
    mockStart.mockResolvedValue({ ok: true, data: { started_at: STARTED_AT } });
    const h = setup({ myReady: true, opponentReady: false, canStart: true });
    await settle();
    act(() => h.result.current.stop());
    expect(h.onGaveUp).not.toHaveBeenCalled();
    expect(h.result.current.myReady).toBe(true);
    h.rerender({ opponentReady: true, canStart: true });
    await settle();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("with a call in flight: nothing (Leave is hidden then, and refuses)", async () => {
    let answer!: (v: unknown) => void;
    mockStart.mockResolvedValue(REFUSED);
    mockStart.mockResolvedValueOnce(REFUSED).mockReturnValueOnce(new Promise((r) => (answer = r)));
    const h = setup(BOTH_READY);
    await settle();
    await advance(START_RETRY_BACKOFF_MS[0]);
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(h.startedRef.current).toBe(true);
    act(() => h.result.current.stop());
    expect(h.onGaveUp).not.toHaveBeenCalled();
    expect(h.result.current.myReady).toBe(true);
    await act(async () => {
      answer(REFUSED);
    });
    await settle();
    // The run goes on as A29 says: still one toast, the last attempt after the 4 s wait.
    expect(toast.error).toHaveBeenCalledTimes(1);
    await advance(START_RETRY_BACKOFF_MS[1]);
    expect(mockStart).toHaveBeenCalledTimes(MAX_START_ATTEMPTS);
    expect(h.onGaveUp).toHaveBeenCalledTimes(1);
  });
});
