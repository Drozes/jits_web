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

import { MAX_AUTO_END_ATTEMPTS, useLiveControls } from "@/lib/match-flow/use-live-controls";
import { SEND_CEILING_MS } from "@/lib/match-flow/send-timing";
import { toast } from "@/components/ui/toast";
import { mapPostgrestError } from "@jits/shared/api/errors";

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

// ---- timekeeper mode (slice M4): the endVia seam and the actor on sends ----

const mockEndMatchClock = jest.fn();
const mockLeaveSeat = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  endMatchClock: (...a: unknown[]) => mockEndMatchClock(...a),
  leaveMatchAsTimekeeper: (...a: unknown[]) => mockLeaveSeat(...a),
  // The real timekeeper table: the pause and resume refusals are sorted on the server's own hint.
  mapTimekeeperError: jest.requireActual("@jits/shared/api/timekeeper").mapTimekeeperError,
}));

describe("timekeeper mode", () => {
  const React = require("react") as typeof import("react");
  const { MatchSyncProvider } = require("@/lib/match-flow/match-sync-context") as typeof import("@/lib/match-flow/match-sync-context");
  const reconcileNow = jest.fn();
  const order: string[] = [];

  function setupTk(endVia: "end_match_clock" | "broadcast" | null, paused = false) {
    const syncFromBroadcast = jest.fn();
    const timer = { elapsed: 42, remaining: 258, running: true, paused, formatted: "04:18", percentComplete: 14, syncFromBroadcast };
    const sync = {
      broadcastTimerResumed: jest.fn(),
      broadcastTimerPaused: jest.fn(),
      broadcastMatchEnded: jest.fn((...a: unknown[]) => {
        order.push(`broadcastMatchEnded(${a.join(",")})`);
        return Promise.resolve("ok");
      }),
      broadcastMatchCancelled: jest.fn(() => Promise.resolve("ok")),
    };
    const endedRef = { current: false };
    const onEnded = jest.fn((s: number) => order.push(`onEnded(${s})`));
    const value = {
      onChannelStatus: jest.fn(),
      reconcileNow,
      markExiting: jest.fn(),
      subscribeSnapshot: () => () => undefined,
      timekeeperModeSelfId: "tk-1",
    };
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MatchSyncProvider, { value }, children);
    const { result } = renderHook(
      () => useLiveControls({ matchId: "M1", timer, sync: sync as never, endedRef, onEnded, endVia }),
      { wrapper },
    );
    return { result, sync, endedRef, onEnded, syncFromBroadcast };
  }

  beforeEach(() => {
    order.length = 0;
    mockEndMatchClock.mockReset();
    mockLeaveSeat.mockReset();
    mockEndMatchClock.mockImplementation(async (...a: unknown[]) => {
      order.push(`end_match_clock(${a[1]},${a[2]})`);
      return { ok: true, data: { endedAt: "2026-10-20T12:00:00Z", finalElapsedS: a[2] } };
    });
  });

  it("end_match_clock: the server end first, then match_ended with the actor, then the result", async () => {
    const { result } = setupTk("end_match_clock");
    await act(async () => {
      result.current.handleEnd();
    });
    expect(order).toEqual(["end_match_clock(M1,42)", "broadcastMatchEnded(tk-1)", "onEnded(42)"]);
    expect(result.current.busy).toBeNull();
    expect(result.current.endFailures).toBe(0);
  });

  it("null: this phone never ends the clock (a timekeeper-mode athlete)", async () => {
    const { result, sync, endedRef, onEnded } = setupTk(null);
    await act(async () => {
      result.current.handleEnd();
    });
    expect(mockEndMatchClock).not.toHaveBeenCalled();
    expect(sync.broadcastMatchEnded).not.toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();
    expect(endedRef.current).toBe(false);
  });

  it("a failed server end re-arms the end, clears the ended view and counts the failure", async () => {
    mockEndMatchClock.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const failed = setupTk("end_match_clock");
    await act(async () => {
      failed.result.current.handleEnd();
    });
    expect(failed.endedRef.current).toBe(false);
    expect(failed.result.current.ended).toBe(false);
    expect(failed.result.current.endFailures).toBe(1);
    expect(failed.result.current.canAutoEnd).toBe(true);
    expect(failed.sync.broadcastMatchEnded).not.toHaveBeenCalled();
    expect(reconcileNow).toHaveBeenCalledTimes(1);
  });

  it("the auto-end stops being offered after MAX_AUTO_END_ATTEMPTS failed server ends", async () => {
    mockEndMatchClock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const failed = setupTk("end_match_clock");
    for (let i = 0; i < MAX_AUTO_END_ATTEMPTS; i++) {
      expect(failed.result.current.canAutoEnd).toBe(true);
      await act(async () => {
        failed.result.current.handleEnd();
      });
    }
    expect(failed.result.current.endFailures).toBe(MAX_AUTO_END_ATTEMPTS);
    expect(failed.result.current.canAutoEnd).toBe(false);
  });

  it.each(["MATCH_NOT_LIVE", "NOT_TIMEKEEPER", "NOT_PARTICIPANT", "NOT_TIMEKEEPER_MODE"])(
    "a refusal that the clock moved on (%s) keeps it ended, never broadcasts and re-reads",
    async (code) => {
      mockEndMatchClock.mockResolvedValueOnce({ ok: false, error: { code, message: "x" } });
      const movedOn = setupTk("end_match_clock");
      expect(reconcileNow).not.toHaveBeenCalled();
      await act(async () => {
        movedOn.result.current.handleEnd();
      });
      expect(movedOn.endedRef.current).toBe(true);
      expect(movedOn.result.current.ended).toBe(true);
      expect(movedOn.result.current.endFailures).toBe(0);
      expect(movedOn.result.current.busy).toBeNull();
      expect(movedOn.sync.broadcastMatchEnded).not.toHaveBeenCalled();
      expect(movedOn.onEnded).not.toHaveBeenCalled();
      expect(reconcileNow).toHaveBeenCalledTimes(1);
    },
  );

  it("a server end that throws (no Result) counts as a failure that changed nothing", async () => {
    mockEndMatchClock.mockRejectedValueOnce(new Error("network"));
    const thrown = setupTk("end_match_clock");
    await act(async () => {
      thrown.result.current.handleEnd();
    });
    expect(thrown.endedRef.current).toBe(false);
    expect(thrown.result.current.endFailures).toBe(1);
    expect(thrown.sync.broadcastMatchEnded).not.toHaveBeenCalled();
  });

  it("a two-athlete match: the end is the broadcast alone, ended at once, and the auto-end is always offered", async () => {
    const { result, sync, onEnded } = setupTk("broadcast");
    expect(result.current.canAutoEnd).toBe(true);
    await act(async () => {
      result.current.handleEnd();
    });
    expect(mockEndMatchClock).not.toHaveBeenCalled();
    expect(sync.broadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith(42);
    expect(result.current.ended).toBe(true);
  });

  it("an athlete in timekeeper mode (null) never auto-ends", () => {
    expect(setupTk(null).result.current.canAutoEnd).toBe(false);
  });

  /**
   * What the shipped `pauseMatch` / `resumeMatch` return for a server refusal:
   * the shared mapping of the PostgrestError `_tk_pause_match` /
   * `_tk_resume_match` raise (jr_be 20261021100400), whose hint the shared
   * table may not know (then UNKNOWN, carrying the server's own text).
   */
  const refusedBy = (hint: string, message: string) => ({
    ok: false,
    error: mapPostgrestError({ code: "P0001", hint, message, details: "" } as never),
  });
  const GUIDANCE = "Check your connection and try again.";
  const shown = () => JSON.stringify((toast.error as jest.Mock).mock.calls);

  it.each([
    ["match_not_live", "The clock has ended"],
    ["match_not_in_progress", "Match is not in progress"],
    ["not_timekeeper", "Only the timekeeper can pause this match"],
  ])("a pause or resume the server refused because the clock moved on (%s): the shipped title alone, which is true, never the server's text, and a re-read (M-R4, PM29)", async (hint, message) => {
    const refusal = refusedBy(hint, message);
    // The shared table knows none of these hints: the code alone cannot tell.
    expect(refusal.error.code).toBe("UNKNOWN");
    mockPause.mockResolvedValue(refusal);
    const running = setupTk("end_match_clock");
    await act(async () => {
      await running.result.current.handlePauseResume();
    });
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't pause" });
    expect(reconcileNow).toHaveBeenCalledTimes(1);
    expect(mockGetMatchDetails).not.toHaveBeenCalled();

    mockResume.mockResolvedValue(refusal);
    const paused = setupTk("end_match_clock", true);
    await act(async () => {
      await paused.result.current.handlePauseResume();
    });
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't resume" });
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(reconcileNow).toHaveBeenCalledTimes(2);
    expect(running.sync.broadcastTimerPaused).not.toHaveBeenCalled();
    expect(paused.sync.broadcastTimerResumed).not.toHaveBeenCalled();
    expect(shown()).not.toContain(message);
  });

  it("a pause or resume that failed for a reason the screen cannot show (a network error, an unknown refusal): the title with the guidance, never the error's text, and a re-read (PM29)", async () => {
    // supabase-js on a dead connection: no SQLSTATE, no hint.
    mockPause.mockResolvedValue({ ok: false, error: mapPostgrestError({ code: "", hint: "", message: "TypeError: Network request failed", details: "" } as never) });
    const running = setupTk("end_match_clock");
    await act(async () => {
      await running.result.current.handlePauseResume();
    });
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't pause", description: GUIDANCE });
    mockResume.mockResolvedValue(refusedBy("not_found", "Match not found"));
    const paused = setupTk("end_match_clock", true);
    await act(async () => {
      await paused.result.current.handlePauseResume();
    });
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't resume", description: GUIDANCE });
    // A DomainError with no server refusal behind it (a wrapper that built one itself).
    mockPause.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "The clock has ended" } });
    const again = setupTk("end_match_clock");
    await act(async () => {
      await again.result.current.handlePauseResume();
    });
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't pause", description: GUIDANCE });
    expect(reconcileNow).toHaveBeenCalledTimes(3);
    expect(shown()).not.toMatch(/Network request failed|Match not found|The clock has ended/);
  });

  it("already in the state asked for, and the recovery read finds the match no longer running: the title alone and a re-read", async () => {
    mockPause.mockResolvedValue(refusedBy("already_paused", "Match is already paused"));
    mockGetMatchDetails.mockResolvedValueOnce({ status: "completed", paused_at: null, total_paused_duration: 0 });
    const running = setupTk("end_match_clock");
    await act(async () => {
      await running.result.current.handlePauseResume();
    });
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't pause" });
    mockResume.mockResolvedValue(refusedBy("match_not_paused", "Match is not paused"));
    mockGetMatchDetails.mockResolvedValueOnce({ status: "cancelled", paused_at: null, total_paused_duration: 0 });
    const paused = setupTk("end_match_clock", true);
    await act(async () => {
      await paused.result.current.handlePauseResume();
    });
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't resume" });
    expect(reconcileNow).toHaveBeenCalledTimes(2);
  });

  it("already in the state asked for, but the recovery read failed (null): this phone cannot tell, so the guidance and a re-read", async () => {
    mockPause.mockResolvedValue(refusedBy("already_paused", "Match is already paused"));
    mockGetMatchDetails.mockResolvedValueOnce(null);
    const running = setupTk("end_match_clock");
    await act(async () => {
      await running.result.current.handlePauseResume();
    });
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't pause", description: GUIDANCE });
    mockResume.mockResolvedValue(refusedBy("match_not_paused", "Match is not paused"));
    mockGetMatchDetails.mockResolvedValueOnce(null);
    const paused = setupTk("end_match_clock", true);
    await act(async () => {
      await paused.result.current.handlePauseResume();
    });
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't resume", description: GUIDANCE });
    expect(running.syncFromBroadcast).not.toHaveBeenCalled();
    expect(paused.syncFromBroadcast).not.toHaveBeenCalled();
    expect(reconcileNow).toHaveBeenCalledTimes(2);
    expect(shown()).not.toContain("Match is");
  });

  it("two-athlete mode keeps the shipped toast for the same refusals: the error's own message, no re-read", async () => {
    mockPause.mockResolvedValue(refusedBy("match_not_in_progress", "Match is not in progress"));
    const running = setupTk("broadcast");
    await act(async () => {
      await running.result.current.handlePauseResume();
    });
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't pause", description: "Match is not in progress" });
    mockPause.mockResolvedValue(refusedBy("already_paused", "Match is already paused"));
    mockGetMatchDetails.mockResolvedValueOnce(null);
    const again = setupTk("broadcast");
    await act(async () => {
      await again.result.current.handlePauseResume();
    });
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't pause", description: "Match is already paused." });
    expect(reconcileNow).not.toHaveBeenCalled();
  });

  describe("PM29: the ceiling on a server-run pause and resume", () => {
    afterEach(() => jest.useRealTimers());

    it("no reply: the controls stay busy just before the ceiling; at it Couldn't pause with the guidance, the controls back (End works again), and a late reply is dropped", async () => {
      jest.useFakeTimers();
      let reply: (v: unknown) => void = () => undefined;
      mockPause.mockReturnValue(new Promise((r) => (reply = r)));
      const running = setupTk("end_match_clock");
      await act(async () => {
        void running.result.current.handlePauseResume();
      });
      expect(running.result.current.busy).toBe("pause");
      await act(async () => {
        jest.advanceTimersByTime(SEND_CEILING_MS - 1);
      });
      expect(running.result.current.busy).toBe("pause");
      expect(toast.error).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(running.result.current.busy).toBeNull();
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't pause", description: "Check your connection and try again." });
      expect(reconcileNow).toHaveBeenCalledTimes(1);
      // The late pause reply: the DB reads resync the clock; this phone applies and announces nothing.
      await act(async () => {
        reply({ ok: true, data: { paused_at: PAUSED_AT } });
      });
      expect(running.syncFromBroadcast).not.toHaveBeenCalled();
      expect(running.sync.broadcastTimerPaused).not.toHaveBeenCalled();
      // End is no longer held behind the dead pause.
      await act(async () => {
        running.result.current.handleEnd();
      });
      expect(mockEndMatchClock).toHaveBeenCalledTimes(1);
    });

    it("a resume with no reply ends the same way", async () => {
      jest.useFakeTimers();
      mockResume.mockReturnValue(new Promise(() => undefined));
      const paused = setupTk("end_match_clock", true);
      await act(async () => {
        void paused.result.current.handlePauseResume();
      });
      await act(async () => {
        jest.advanceTimersByTime(SEND_CEILING_MS);
      });
      expect(paused.result.current.busy).toBeNull();
      expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't resume", description: "Check your connection and try again." });
    });

    it("a two-athlete pause is never bounded (PM29 is timekeeper mode only)", async () => {
      jest.useFakeTimers();
      mockPause.mockReturnValue(new Promise(() => undefined));
      const running = setupTk("broadcast");
      await act(async () => {
        void running.result.current.handlePauseResume();
      });
      await act(async () => {
        jest.advanceTimersByTime(SEND_CEILING_MS * 2);
      });
      expect(running.result.current.busy).toBe("pause");
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  it("names the timekeeper on the pause and resume broadcasts", async () => {
    mockPause.mockResolvedValue({ ok: true, data: { paused_at: PAUSED_AT } });
    const running = setupTk("end_match_clock");
    await act(async () => {
      await running.result.current.handlePauseResume();
    });
    expect(running.sync.broadcastTimerPaused).toHaveBeenCalledWith(PAUSED_AT, "tk-1");

    mockResume.mockResolvedValue({ ok: true, data: { total_paused_duration: 7 } });
    const paused = setupTk("end_match_clock", true);
    await act(async () => {
      await paused.result.current.handlePauseResume();
    });
    expect(paused.sync.broadcastTimerResumed).toHaveBeenCalledWith(7, "tk-1");
  });

  describe("the timekeeper's Leave while the clock runs (useTimekeeperLiveLeave)", () => {
    const { Alert } = require("react-native") as typeof import("react-native");
    let alert: jest.SpyInstance;
    beforeEach(() => {
      alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
        buttons?.[1]?.onPress?.();
      });
    });
    afterEach(() => alert.mockRestore());

    async function leave(r: ReturnType<typeof setupTk>["result"]) {
      await act(async () => {
        r.current.handleLeave();
      });
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });
    }

    it("a failure that changed nothing re-arms Leave and the controls, and re-reads", async () => {
      mockLeaveSeat.mockRejectedValue(new Error("network"));
      const { result, sync, endedRef } = setupTk("end_match_clock");
      await leave(result);
      expect(mockLeaveSeat).toHaveBeenCalledTimes(1);
      expect(result.current.busy).toBeNull();
      expect(endedRef.current).toBe(false);
      expect(sync.broadcastMatchCancelled).not.toHaveBeenCalled();
      expect(reconcileNow).toHaveBeenCalledTimes(1);
      expect(toast.error).not.toHaveBeenCalled();
      // Offered again.
      await leave(result);
      expect(mockLeaveSeat).toHaveBeenCalledTimes(2);
    });

    it("a no contest keeps the controls off and ended, and tells the athletes once", async () => {
      mockLeaveSeat.mockResolvedValue({ ok: true, data: { status: "cancelled" } });
      const { result, sync, endedRef } = setupTk("end_match_clock");
      await leave(result);
      expect(result.current.busy).toBe("leave");
      expect(endedRef.current).toBe(true);
      expect(sync.broadcastMatchCancelled).toHaveBeenCalledTimes(1);
      expect(reconcileNow).toHaveBeenCalledTimes(1);
    });

    it("never opens after the end", async () => {
      const { result, endedRef } = setupTk("end_match_clock");
      endedRef.current = true;
      await leave(result);
      expect(alert).not.toHaveBeenCalled();
      expect(mockLeaveSeat).not.toHaveBeenCalled();
    });

    it("never opens while a pause is in flight", async () => {
      mockPause.mockImplementation(() => new Promise(() => undefined));
      const { result } = setupTk("end_match_clock");
      act(() => {
        void result.current.handlePauseResume();
      });
      expect(result.current.busy).toBe("pause");
      await leave(result);
      expect(alert).not.toHaveBeenCalled();
      expect(mockLeaveSeat).not.toHaveBeenCalled();
    });
  });
});
