/**
 * `useRecordResult` in timekeeper mode (spec 10, ARCHITECTURE M-R8): the
 * timekeeper's `result_submitted` names them (`actor_id`), and an athlete's
 * phone that hears one only re-reads the match: the read, not the broadcast,
 * moves it to confirm. The timekeeper is never auto-confirmed, so nothing is
 * announced as confirmed. A refused record toasts the shipped title and
 * never a DomainError message (M-R4, spec 14.9 X1). A two-athlete match
 * sends and handles the broadcast, and toasts a refusal, exactly as before.
 */
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/match-flow/use-haptics", () => ({ matchHaptics: { resultRecorded: jest.fn(), error: jest.fn() } }));
const mockRecord = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({ recordMatchResult: (...a: unknown[]) => mockRecord(...a) }));
jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: { enqueue: (_k: string, fn: () => unknown) => fn() },
  isQueuedResult: () => false,
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

beforeEach(() => {
  jest.clearAllMocks();
  mockSync.selfId = undefined;
  mockSync.onResultSubmitted = undefined;
});

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
    // An admin recorded or voided the stalled match while the form was open (A27): `invalid_status`.
    ["MATCH_NOT_PENDING", "This match has already been started."],
    ["NOT_TIMEKEEPER", "only the timekeeper can record"],
  ])("a refused record (%s) toasts the shipped title with no DomainError message (M-R4)", async (code, message) => {
    mockSync.selfId = "tk-1";
    mockRecord.mockResolvedValue({ ok: false, error: { code, message } });
    const onRecorded = jest.fn();
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded, currentAthleteId: "ch" }));
    await act(async () => {
      await result.current.submit({ outcome: "draw" });
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't record result" });
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(onRecorded).not.toHaveBeenCalled();
    expect(mockSubmitted).not.toHaveBeenCalled();
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
