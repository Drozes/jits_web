/**
 * useRecordResult haptics (jits-4zp.7): a recorded result gives the
 * resultRecorded buzz once; a failed record gives the error buzz and not
 * the success one. Both were defined in use-haptics.ts but never called.
 */
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
const mockRecorded = jest.fn(() => Promise.resolve());
const mockError = jest.fn(() => Promise.resolve());
jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: { resultRecorded: () => mockRecorded(), error: () => mockError() },
}));
const mockRecord = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  recordMatchResult: (...a: unknown[]) => mockRecord(...a),
}));
let mockQueued = false;
jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: { enqueue: (_k: string, fn: () => unknown) => fn() },
  isQueuedResult: () => mockQueued,
}));
const mockImpact = jest.fn((_s: unknown) => Promise.resolve());
jest.mock("expo-haptics", () => ({
  impactAsync: (s: unknown) => mockImpact(s),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));
const mockReconcile = jest.fn();
jest.mock("@/lib/match-flow/match-sync-context", () => ({
  SEND_GRACE_MS: 1_500,
  useMatchSyncContext: () => ({ reconcileNow: mockReconcile }),
  useStepMatchSync: () => ({ broadcastResultSubmitted: () => Promise.resolve("ok") }),
}));

import { toast } from "@/components/ui/toast";
import { useRecordResult } from "@/lib/match-flow/use-record-result";

beforeEach(() => {
  jest.clearAllMocks();
  mockQueued = false;
});

it("buzzes resultRecorded once when the record succeeds", async () => {
  mockRecord.mockResolvedValue({ ok: true, data: {} });
  const onRecorded = jest.fn();
  const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded }));
  await act(async () => {
    await result.current.submit({ outcome: "draw" });
  });
  expect(onRecorded).toHaveBeenCalledTimes(1);
  expect(mockRecorded).toHaveBeenCalledTimes(1);
  expect(mockError).not.toHaveBeenCalled();
});

it("buzzes the error haptic alongside the failure toast", async () => {
  mockRecord.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "nope" } });
  const onRecorded = jest.fn();
  const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded }));
  await act(async () => {
    await result.current.submit({ outcome: "draw" });
  });
  expect(toast.error).toHaveBeenCalledTimes(1);
  expect(mockError).toHaveBeenCalledTimes(1);
  expect(mockRecorded).not.toHaveBeenCalled();
  expect(onRecorded).not.toHaveBeenCalled();
  expect(mockReconcile).toHaveBeenCalledTimes(1);
});

it("a result queued offline gets a light impact, not the Success buzz", async () => {
  mockQueued = true;
  mockRecord.mockResolvedValue({ ok: true, data: { queued: true } });
  const onRecorded = jest.fn();
  const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded }));
  await act(async () => {
    await result.current.submit({ outcome: "draw" });
  });
  expect(onRecorded).toHaveBeenCalledTimes(1);
  expect(mockRecorded).not.toHaveBeenCalled();
  expect(mockImpact).toHaveBeenCalledWith("light");
  expect(mockError).not.toHaveBeenCalled();
});
