/**
 * Resume on a match that is already running (use-live-controls.ts). If this
 * device missed the opponent's resume, its timer shows paused and a Resume
 * tap gets MATCH_NOT_PAUSED from resume_match. That used to only toast,
 * leaving the timer paused; it now takes the running state from the DB.
 */
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
const mockResume = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  pauseMatch: jest.fn(),
  resumeMatch: (...a: unknown[]) => mockResume(...a),
}));
const mockGetMatchDetails = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
}));

import { useLiveControls } from "@/lib/match-flow/use-live-controls";
import { toast } from "@/components/ui/toast";

const NOT_PAUSED = { ok: false, error: { code: "MATCH_NOT_PAUSED", message: "Match is not currently paused." } };

function setup() {
  const syncFromBroadcast = jest.fn();
  const timer = {
    elapsed: 10,
    remaining: 290,
    running: true,
    paused: true,
    formatted: "04:50",
    percentComplete: 3,
    syncFromBroadcast,
  };
  const sync = { broadcastTimerResumed: jest.fn(), broadcastTimerPaused: jest.fn(), broadcastMatchEnded: jest.fn() };
  const { result } = renderHook(() =>
    useLiveControls({
      matchId: "M1",
      timer,
      sync: sync as never,
      endedRef: { current: false },
      onEnded: jest.fn(),
    }),
  );
  return { result, syncFromBroadcast, sync };
}

beforeEach(() => jest.clearAllMocks());

it("MATCH_NOT_PAUSED applies the DB's running state instead of only toasting", async () => {
  mockResume.mockResolvedValue(NOT_PAUSED);
  mockGetMatchDetails.mockResolvedValue({ status: "in_progress", paused_at: null, total_paused_duration: 0 });
  const { result, syncFromBroadcast, sync } = setup();
  await act(async () => {
    await result.current.handlePauseResume();
  });
  expect(syncFromBroadcast).toHaveBeenCalledWith({ type: "resumed", totalPausedDuration: 0 });
  expect(toast.error).not.toHaveBeenCalled();
  // The opponent already resumed; nothing to tell them.
  expect(sync.broadcastTimerResumed).not.toHaveBeenCalled();
});

it("still toasts when the DB read cannot confirm the match is running", async () => {
  mockResume.mockResolvedValue(NOT_PAUSED);
  mockGetMatchDetails.mockResolvedValue(null);
  const { result, syncFromBroadcast } = setup();
  await act(async () => {
    await result.current.handlePauseResume();
  });
  expect(syncFromBroadcast).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(expect.objectContaining({ text1: "Couldn't resume" }));
});

it("any other resume error toasts without a DB read", async () => {
  mockResume.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
  const { result, syncFromBroadcast } = setup();
  await act(async () => {
    await result.current.handlePauseResume();
  });
  expect(mockGetMatchDetails).not.toHaveBeenCalled();
  expect(syncFromBroadcast).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't resume", description: "boom" });
});
