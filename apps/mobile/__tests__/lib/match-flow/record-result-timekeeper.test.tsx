/**
 * `useRecordResult` in timekeeper mode (spec 10, ARCHITECTURE M-R8): the
 * timekeeper's `result_submitted` names them (`actor_id`), and an athlete's
 * phone that hears one only re-reads the match: the read, not the broadcast,
 * moves it to confirm. The timekeeper is never auto-confirmed, so nothing is
 * announced as confirmed. A refused record toasts the shipped title and
 * never a DomainError message (M-R4, spec 14.9 X1), with `Check your
 * connection and try again.` (PM29); a refusal that means the match moved on
 * (MATCH_NOT_PENDING) shows no toast and re-reads; a record with no reply
 * ends as that failure after SEND_CEILING_MS (PM29). A two-athlete match
 * sends and handles the broadcast, and toasts a refusal, exactly as before.
 */
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
const mockHapticError = jest.fn();
jest.mock("@/lib/match-flow/use-haptics", () => ({ matchHaptics: { resultRecorded: jest.fn(), error: () => mockHapticError() } }));
const mockRecord = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({ recordMatchResult: (...a: unknown[]) => mockRecord(...a) }));
const mockIsQueued = jest.fn((_v: unknown) => false);
jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: { enqueue: (_k: string, fn: () => unknown) => fn() },
  isQueuedResult: (v: unknown) => mockIsQueued(v),
}));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: "light" } }));

const mockReconcile = jest.fn();
const mockSync: { selfId?: string; onResultSubmitted?: (r: unknown) => void } = {};
const mockSubmitted = jest.fn((..._a: unknown[]) => Promise.resolve("ok"));
const mockConfirmed = jest.fn((..._a: unknown[]) => Promise.resolve("ok"));
jest.mock("@/lib/match-flow/match-sync-context", () => ({
  SEND_GRACE_MS: 1_500,
  useMatchSyncContext: () => ({ reconcileNow: mockReconcile, timekeeperModeSelfId: mockSync.selfId }),
  useStepMatchSync: (p: { onResultSubmitted?: (r: unknown) => void }) => {
    mockSync.onResultSubmitted = p.onResultSubmitted;
    return { broadcastResultSubmitted: mockSubmitted, broadcastResultConfirmed: mockConfirmed };
  },
}));

import { toast } from "@/components/ui/toast";
import { useRecordResult } from "@/lib/match-flow/use-record-result";
import { SEND_CEILING_MS } from "@/lib/match-flow/send-timing";

const GUIDANCE = "Check your connection and try again.";

beforeEach(() => {
  jest.clearAllMocks();
  mockIsQueued.mockReturnValue(false);
  mockSync.selfId = undefined;
  mockSync.onResultSubmitted = undefined;
});
afterEach(() => jest.useRealTimers());

describe("timekeeper mode", () => {
  it("the timekeeper's result_submitted names them, and nobody is announced confirmed", async () => {
    mockSync.selfId = "tk-1";
    mockRecord.mockResolvedValue({ ok: true, data: { recorder_confirmed: false } });
    const onRecorded = jest.fn();
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded, currentAthleteId: "ch" }));
    await act(async () => {
      await result.current.submit({ outcome: "draw" });
    });
    expect(mockSubmitted).toHaveBeenCalledWith(expect.objectContaining({ result: "draw" }), "tk-1");
    expect(mockConfirmed).not.toHaveBeenCalled();
    expect(onRecorded).toHaveBeenCalledWith(expect.objectContaining({ result: "draw" }), { recorderConfirmed: false });
  });

  it("an athlete hearing it only re-reads the match; the step does not move on the broadcast", () => {
    mockSync.selfId = "me";
    const onRecorded = jest.fn();
    renderHook(() => useRecordResult({ matchId: "M1", onRecorded, currentAthleteId: "me" }));
    act(() => mockSync.onResultSubmitted?.({ result: "submission", winnerId: "me" }));
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(onRecorded).not.toHaveBeenCalled();
    // Every later one re-reads too.
    act(() => mockSync.onResultSubmitted?.({ result: "draw" }));
    expect(mockReconcile).toHaveBeenCalledTimes(2);
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it.each([
    ["NOT_TIMEKEEPER", "only the timekeeper can record"],
    ["UNKNOWN", "Network request failed"],
  ])("a refused record (%s) toasts the shipped title with the guidance, never a DomainError message (M-R4, PM29)", async (code, message) => {
    mockSync.selfId = "tk-1";
    mockRecord.mockResolvedValue({ ok: false, error: { code, message } });
    const onRecorded = jest.fn();
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded, currentAthleteId: "ch" }));
    await act(async () => {
      await result.current.submit({ outcome: "draw" });
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't record result", description: GUIDANCE });
    expect(mockHapticError).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(onRecorded).not.toHaveBeenCalled();
    expect(mockSubmitted).not.toHaveBeenCalled();
  });

  it("moved on (MATCH_NOT_PENDING: this phone's earlier send landed, or an admin recorded or voided the stalled match, A27): no toast, no haptic, a re-read", async () => {
    mockSync.selfId = "tk-1";
    mockRecord.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "This match has already been started." } });
    const onRecorded = jest.fn();
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded, currentAthleteId: "ch" }));
    await act(async () => {
      await result.current.submit({ outcome: "draw" });
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(mockHapticError).not.toHaveBeenCalled();
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("no reply (PM29): Recording... until the ceiling; then the failure with the guidance, the form back, and a late reply dropped", async () => {
    jest.useFakeTimers();
    mockSync.selfId = "tk-1";
    let reply: (v: unknown) => void = () => undefined;
    mockRecord.mockReturnValue(new Promise((r) => (reply = r)));
    const onRecorded = jest.fn();
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded, currentAthleteId: "ch" }));
    await act(async () => {
      void result.current.submit({ outcome: "draw" });
    });
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS - 1);
    });
    expect(result.current.loading).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.loading).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't record result", description: GUIDANCE });
    expect(mockHapticError).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    // The record lands late: dropped here; the reads move the timekeeper to the done screen.
    await act(async () => {
      reply({ ok: true, data: { recorder_confirmed: false } });
    });
    expect(onRecorded).not.toHaveBeenCalled();
    expect(mockSubmitted).not.toHaveBeenCalled();
    // A retry meets the recorded match: moved on, silent.
    mockRecord.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "This match has already been started." } });
    await act(async () => {
      await result.current.submit({ outcome: "draw" });
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(mockReconcile).toHaveBeenCalledTimes(2);
  });

  it("offline: Saved locally, as shipped", async () => {
    mockSync.selfId = "tk-1";
    mockRecord.mockResolvedValue({ ok: true, data: { queued: true, key: "record-result:M1" } });
    mockIsQueued.mockReturnValue(true);
    const onRecorded = jest.fn();
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded, currentAthleteId: "ch" }));
    await act(async () => {
      await result.current.submit({ outcome: "draw" });
    });
    expect(toast.success).toHaveBeenCalledWith({ text1: "Saved locally", description: "Result will sync when you're back online." });
    expect(onRecorded).toHaveBeenCalledWith(expect.objectContaining({ result: "draw" }), { recorderConfirmed: false });
  });

  it("unmounted with the record out: nothing shows, and the ceiling's timer is gone", async () => {
    jest.useFakeTimers();
    mockSync.selfId = "tk-1";
    mockRecord.mockReturnValue(new Promise(() => undefined));
    const onRecorded = jest.fn();
    const { result, unmount } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded, currentAthleteId: "ch" }));
    await act(async () => {
      void result.current.submit({ outcome: "draw" });
    });
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS * 2);
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(mockHapticError).not.toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
  });
});

describe("two-athlete match (unchanged)", () => {
  it("sends the broadcast with no actor", async () => {
    mockRecord.mockResolvedValue({ ok: true, data: { recorder_confirmed: true } });
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded: jest.fn(), currentAthleteId: "me" }));
    await act(async () => {
      await result.current.submit({ outcome: "draw" });
    });
    expect(mockSubmitted).toHaveBeenCalledTimes(1);
    expect(mockSubmitted.mock.calls[0]).toHaveLength(1);
    expect(mockConfirmed).toHaveBeenCalledWith("me");
  });

  it("hearing the opponent's result moves this phone on, once", () => {
    const onRecorded = jest.fn();
    renderHook(() => useRecordResult({ matchId: "M1", onRecorded, currentAthleteId: "me" }));
    act(() => mockSync.onResultSubmitted?.({ result: "draw" }));
    act(() => mockSync.onResultSubmitted?.({ result: "draw" }));
    expect(onRecorded).toHaveBeenCalledTimes(1);
    expect(onRecorded).toHaveBeenCalledWith({ result: "draw" }, { recorderConfirmed: false });
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("is never bounded: no toast at the ceiling (PM29 is timekeeper mode only)", async () => {
    jest.useFakeTimers();
    mockRecord.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded: jest.fn(), currentAthleteId: "me" }));
    await act(async () => {
      void result.current.submit({ outcome: "draw" });
    });
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS * 2);
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
  });

  it("a refused record keeps the shipped toast, description included", async () => {
    mockRecord.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "This match has already been started." } });
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded: jest.fn(), currentAthleteId: "me" }));
    await act(async () => {
      await result.current.submit({ outcome: "draw" });
    });
    expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't record result", description: "This match has already been started." });
    expect(mockReconcile).toHaveBeenCalledTimes(1);
  });
});
