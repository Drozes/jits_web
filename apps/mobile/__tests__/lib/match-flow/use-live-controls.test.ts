/**
 * Resume on a match that is already running (use-live-controls.ts). If this
 * device missed the opponent's resume, its timer shows paused and a Resume
 * tap gets MATCH_NOT_PAUSED from resume_match. That used to only toast,
 * leaving the timer paused; it now takes the running state from the DB.
 *
 * Pause mirrors it: a Pause tap on a match the opponent already paused gets
 * MATCH_NOT_IN_PROGRESS ("already paused") from pause_match, and the timer
 * takes the paused state from the DB instead of toasting.
 */
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
const mockResume = jest.fn();
const mockPause = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  pauseMatch: (...a: unknown[]) => mockPause(...a),
  resumeMatch: (...a: unknown[]) => mockResume(...a),
}));
const mockGetMatchDetails = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
}));

import { useLiveControls } from "@/lib/match-flow/use-live-controls";
import { toast } from "@/components/ui/toast";

const NOT_PAUSED = { ok: false, error: { code: "MATCH_NOT_PAUSED", message: "Match is not currently paused." } };

function setup(paused = true) {
  const syncFromBroadcast = jest.fn();
  const timer = {
    elapsed: 10,
    remaining: 290,
    running: true,
    paused,
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

const ALREADY_PAUSED = { ok: false, error: { code: "MATCH_NOT_IN_PROGRESS", message: "Match is already paused." } };
const PAUSED_AT = "2026-09-26T10:00:00.000Z";

describe("pause on a match that is already paused", () => {
  it("applies the DB's paused state through the tracked timer instead of toasting", async () => {
    mockPause.mockResolvedValue(ALREADY_PAUSED);
    mockGetMatchDetails.mockResolvedValue({ status: "in_progress", paused_at: PAUSED_AT, total_paused_duration: 0 });
    const { result, syncFromBroadcast, sync } = setup(false);
    await act(async () => {
      await result.current.handlePauseResume();
    });
    expect(mockGetMatchDetails).toHaveBeenCalledWith({}, "M1");
    expect(syncFromBroadcast).toHaveBeenCalledWith({ type: "paused", pausedAt: PAUSED_AT });
    expect(toast.error).not.toHaveBeenCalled();
    // The opponent paused it; nothing to tell them.
    expect(sync.broadcastTimerPaused).not.toHaveBeenCalled();
    expect(result.current.busy).toBeNull();
  });

  it("still toasts when the DB says the match is running", async () => {
    mockPause.mockResolvedValue(ALREADY_PAUSED);
    mockGetMatchDetails.mockResolvedValue({ status: "in_progress", paused_at: null, total_paused_duration: 0 });
    const { result, syncFromBroadcast } = setup(false);
    await act(async () => {
      await result.current.handlePauseResume();
    });
    expect(syncFromBroadcast).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't pause", description: "Match is already paused." });
  });

  it("still toasts when the match is no longer in progress or the read fails", async () => {
    mockPause.mockResolvedValue(ALREADY_PAUSED);
    mockGetMatchDetails.mockResolvedValueOnce({ status: "completed", paused_at: PAUSED_AT, total_paused_duration: 0 });
    const first = setup(false);
    await act(async () => {
      await first.result.current.handlePauseResume();
    });
    mockGetMatchDetails.mockResolvedValueOnce(null);
    const second = setup(false);
    await act(async () => {
      await second.result.current.handlePauseResume();
    });
    expect(first.syncFromBroadcast).not.toHaveBeenCalled();
    expect(second.syncFromBroadcast).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it("any other pause error toasts without a DB read", async () => {
    mockPause.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const { result, syncFromBroadcast } = setup(false);
    await act(async () => {
      await result.current.handlePauseResume();
    });
    expect(mockGetMatchDetails).not.toHaveBeenCalled();
    expect(syncFromBroadcast).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't pause", description: "boom" });
  });

  it("a successful pause still applies and broadcasts", async () => {
    mockPause.mockResolvedValue({ ok: true, data: { paused_at: PAUSED_AT } });
    const { result, syncFromBroadcast, sync } = setup(false);
    await act(async () => {
      await result.current.handlePauseResume();
    });
    expect(mockGetMatchDetails).not.toHaveBeenCalled();
    expect(syncFromBroadcast).toHaveBeenCalledWith({ type: "paused", pausedAt: PAUSED_AT });
    expect(sync.broadcastTimerPaused).toHaveBeenCalledWith(PAUSED_AT);
  });
});
