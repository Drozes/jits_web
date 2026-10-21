/**
 * The timekeeper-mode actions the shared live and face-off hooks call
 * (`lib/match-flow/timekeeper-actions.ts`; slice M4, ARCHITECTURE 2.3 "End"
 * and "Leave"): each wrapper result maps to an outcome, never a message
 * (M-R4). A refusal that means the server moved on asks for a re-read; a
 * failure that changed nothing (an unknown code, or a wrapper that throws)
 * offers the action again.
 */
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
const mockEndMatchClock = jest.fn();
const mockLeave = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  endMatchClock: (...a: unknown[]) => mockEndMatchClock(...a),
  leaveMatchAsTimekeeper: (...a: unknown[]) => mockLeave(...a),
}));

import { endClockAsTimekeeper, leaveSeat } from "@/lib/match-flow/timekeeper-actions";

const refused = (code: string) => ({ ok: false, error: { code, message: "server text" } });

beforeEach(() => jest.resetAllMocks());

describe("endClockAsTimekeeper (end_match_clock)", () => {
  it("ends: the clock's end is stamped, at the elapsed seconds given", async () => {
    mockEndMatchClock.mockResolvedValue({ ok: true, data: { endedAt: "2026-10-20T12:00:00Z", finalElapsedS: 120 } });
    await expect(endClockAsTimekeeper("M1", 120)).resolves.toBe("ended");
    expect(mockEndMatchClock).toHaveBeenCalledWith({ tag: "client" }, "M1", 120);
  });

  it.each(["MATCH_NOT_LIVE", "NOT_TIMEKEEPER", "NOT_PARTICIPANT", "NOT_TIMEKEEPER_MODE"])(
    "%s: the server moved on (re-read, never retry)",
    async (code) => {
      mockEndMatchClock.mockResolvedValue(refused(code));
      await expect(endClockAsTimekeeper("M1", 120)).resolves.toBe("moved_on");
    },
  );

  it.each(["UNKNOWN", "RLS_VIOLATION"])("%s: a failure that changed nothing", async (code) => {
    mockEndMatchClock.mockResolvedValue(refused(code));
    await expect(endClockAsTimekeeper("M1", 120)).resolves.toBe("failed");
  });

  it("a wrapper that throws (a network error) is a failure, never a crash", async () => {
    mockEndMatchClock.mockRejectedValue(new Error("network"));
    await expect(endClockAsTimekeeper("M1", 120)).resolves.toBe("failed");
  });
});

describe("leaveSeat (leave_match_as_timekeeper)", () => {
  it("before the start: unseated (the athletes pick again)", async () => {
    mockLeave.mockResolvedValue({ ok: true, data: { status: "pending" } });
    await expect(leaveSeat("M1")).resolves.toBe("unseated");
    expect(mockLeave).toHaveBeenCalledWith({ tag: "client" }, "M1");
  });

  it("while the clock ran: a no contest", async () => {
    mockLeave.mockResolvedValue({ ok: true, data: { status: "cancelled" } });
    await expect(leaveSeat("M1")).resolves.toBe("no_contest");
  });

  it.each(["RESULT_OWED", "NOT_TIMEKEEPER", "NOT_PARTICIPANT", "NOT_TIMEKEEPER_MODE", "MATCH_NOT_PENDING"])(
    "%s: the server moved on (re-read)",
    async (code) => {
      mockLeave.mockResolvedValue(refused(code));
      await expect(leaveSeat("M1")).resolves.toBe("moved_on");
    },
  );

  it("an unknown refusal is a failure that changed nothing", async () => {
    mockLeave.mockResolvedValue(refused("UNKNOWN"));
    await expect(leaveSeat("M1")).resolves.toBe("failed");
  });

  it("a wrapper that throws (a network error) is a failure, never a crash", async () => {
    mockLeave.mockRejectedValue(new Error("network"));
    await expect(leaveSeat("M1")).resolves.toBe("failed");
  });
});
