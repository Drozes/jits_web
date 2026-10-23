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
  mapTimekeeperError: jest.requireActual("@jits/shared/api/timekeeper").mapTimekeeperError,
}));

import { mapPostgrestError } from "@jits/shared/api/errors";
import { clockMovedOn, endClockAsTimekeeper, leaveSeat } from "@/lib/match-flow/timekeeper-actions";

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

describe("clockMovedOn (a refused pause or resume of the timekeeper's clock, PM29)", () => {
  /** What the shipped pauseMatch / resumeMatch return: the shared mapping of the server's PostgrestError. */
  const fromServer = (hint: string, code = "P0001") => mapPostgrestError({ code, hint, message: "server text", details: "" } as never);

  it.each(["match_not_live", "match_not_in_progress", "not_timekeeper", "not_timekeeper_mode", "already_paused", "match_not_paused"])(
    "%s (jr_be 20261021100400): the clock moved on, whatever the shared table made of it",
    (hint) => {
      expect(clockMovedOn(fromServer(hint))).toBe(true);
    },
  );

  it("the timekeeper-mode hints the shared table does not know arrive as UNKNOWN, so the code alone cannot tell", () => {
    for (const hint of ["match_not_live", "match_not_in_progress", "not_timekeeper"]) {
      expect([hint, fromServer(hint).code]).toEqual([hint, "UNKNOWN"]);
    }
  });

  it.each([
    ["a network error (no SQLSTATE, no hint)", fromServer("", "")],
    ["an unknown match", fromServer("not_found")],
    ["a 5xx", mapPostgrestError({ code: "PGRST000", hint: null, message: "server text", details: "" } as never)],
    ["no reply within the ceiling", { code: "UNKNOWN" as const, message: "" }],
  ])("%s: a failure the screen cannot explain", (_name, error) => {
    expect(clockMovedOn(error)).toBe(false);
  });

  it("with no server refusal behind it, the mapped code decides", () => {
    expect(clockMovedOn({ code: "MATCH_NOT_LIVE", message: "" })).toBe(true);
    expect(clockMovedOn({ code: "MATCH_NOT_PAUSED", message: "" })).toBe(true);
    expect(clockMovedOn({ code: "RLS_VIOLATION", message: "" })).toBe(false);
  });
});
