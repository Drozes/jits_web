/**
 * The `myTimekeepingMatch` slot (timekeeper mode A20, spec 9.1): the match
 * the signed-in athlete timekeeps, read by `get_my_timekeeping_match`, newest
 * read wins, keyed to the athlete it was read for. `isTimekeepingActive` is
 * the on-duty rule the header chip and the Arena lock share (PM20).
 */
import { act, renderHook } from "@testing-library/react-native";
import type { MyTimekeepingMatch } from "@jits/shared/api/timekeeper";

const mockGetMyTimekeepingMatch = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  getMyTimekeepingMatch: (...a: unknown[]) => mockGetMyTimekeepingMatch(...a),
}));

import {
  __resetTimekeepingMatchStoreForTests,
  isTimekeepingActive,
  isTimekeepingMatchOffered,
  refreshMyTimekeepingMatch,
  useMyTimekeepingMatch,
} from "@/lib/match-flow/timekeeping-match-store";

const CLIENT = { tag: "client" } as never;
const ME = "me-1";

function match(over: Partial<MyTimekeepingMatch> = {}): MyTimekeepingMatch {
  return {
    matchId: "tk-1",
    status: "pending",
    startedAt: null,
    endedAt: null,
    athletes: [
      { athleteId: "c-1", displayName: "Mina Reyes" },
      { athleteId: "o-1", displayName: "Dan Okafor" },
    ],
    reviewPending: false,
    editOpen: false,
    editClosesAt: null,
    ...over,
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetTimekeepingMatchStoreForTests();
  mockGetMyTimekeepingMatch.mockResolvedValue({ ok: true, data: null });
});

describe("isTimekeepingActive", () => {
  it("on duty only while pending or in progress, never in the edit window", () => {
    expect(isTimekeepingActive(match({ status: "pending" }))).toBe(true);
    expect(isTimekeepingActive(match({ status: "in_progress" }))).toBe(true);
    expect(isTimekeepingActive(match({ status: "completed", editOpen: true }))).toBe(false);
    expect(isTimekeepingActive(null)).toBe(false);
  });
});

describe("isTimekeepingMatchOffered", () => {
  it("always while seated or running; once recorded, only before its open edit window closes (A24)", () => {
    const closes = Date.parse("2026-10-20T12:36:00.000Z");
    const recorded = (over: Partial<MyTimekeepingMatch> = {}) =>
      match({ status: "completed", editOpen: true, editClosesAt: new Date(closes).toISOString(), ...over });
    expect(isTimekeepingMatchOffered(match({ status: "pending" }), closes + 1)).toBe(true);
    expect(isTimekeepingMatchOffered(match({ status: "in_progress" }), closes + 1)).toBe(true);
    expect(isTimekeepingMatchOffered(recorded(), closes - 1)).toBe(true);
    expect(isTimekeepingMatchOffered(recorded(), closes)).toBe(false);
    expect(isTimekeepingMatchOffered(recorded({ editOpen: false }), closes - 1)).toBe(false);
    expect(isTimekeepingMatchOffered(recorded({ editClosesAt: null }), closes - 1)).toBe(false);
    expect(isTimekeepingMatchOffered(recorded({ editClosesAt: "not a time" }), closes - 1)).toBe(false);
  });
});

describe("timekeeping slot", () => {
  it("reads with the caller's client and shows the match to that athlete only", async () => {
    mockGetMyTimekeepingMatch.mockResolvedValue({ ok: true, data: match() });
    const mine = renderHook(() => useMyTimekeepingMatch(ME));
    const other = renderHook(() => useMyTimekeepingMatch("someone-else"));
    const nobody = renderHook(() => useMyTimekeepingMatch(null));
    act(() => refreshMyTimekeepingMatch(CLIENT, ME));
    await flush();
    expect(mockGetMyTimekeepingMatch).toHaveBeenCalledWith(CLIENT);
    expect(mine.result.current?.matchId).toBe("tk-1");
    expect(other.result.current).toBeNull();
    expect(nobody.result.current).toBeNull();
  });

  it("keeps what it had when a read fails or rejects", async () => {
    mockGetMyTimekeepingMatch.mockResolvedValue({ ok: true, data: match() });
    const { result } = renderHook(() => useMyTimekeepingMatch(ME));
    act(() => refreshMyTimekeepingMatch(CLIENT, ME));
    await flush();
    mockGetMyTimekeepingMatch.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    act(() => refreshMyTimekeepingMatch(CLIENT, ME));
    await flush();
    mockGetMyTimekeepingMatch.mockRejectedValue(new Error("boom"));
    act(() => refreshMyTimekeepingMatch(CLIENT, ME));
    await flush();
    expect(result.current?.matchId).toBe("tk-1");
  });

  it("only the newest read writes", async () => {
    let resolveOld!: (v: unknown) => void;
    mockGetMyTimekeepingMatch.mockReturnValueOnce(new Promise((r) => (resolveOld = r)));
    mockGetMyTimekeepingMatch.mockResolvedValueOnce({ ok: true, data: match({ status: "in_progress" }) });
    const { result } = renderHook(() => useMyTimekeepingMatch(ME));
    act(() => refreshMyTimekeepingMatch(CLIENT, ME));
    act(() => refreshMyTimekeepingMatch(CLIENT, ME));
    await flush();
    expect(result.current?.status).toBe("in_progress");
    await act(async () => resolveOld({ ok: true, data: null }));
    await flush();
    expect(result.current?.status).toBe("in_progress");
  });

  it("a read for an earlier athlete never writes once one for another athlete is issued (account switch)", async () => {
    let resolveOld!: (v: unknown) => void;
    mockGetMyTimekeepingMatch.mockReturnValueOnce(new Promise((r) => (resolveOld = r)));
    mockGetMyTimekeepingMatch.mockReturnValueOnce(new Promise(() => {}));
    const mine = renderHook(() => useMyTimekeepingMatch(ME));
    act(() => refreshMyTimekeepingMatch(CLIENT, ME));
    act(() => refreshMyTimekeepingMatch(CLIENT, "next-athlete"));
    await flush();
    await act(async () => resolveOld({ ok: true, data: match() }));
    await flush();
    expect(mockGetMyTimekeepingMatch).toHaveBeenCalledTimes(2);
    expect(mine.result.current).toBeNull();
  });

  it("a match that ended drops out on the next read", async () => {
    mockGetMyTimekeepingMatch.mockResolvedValue({ ok: true, data: match() });
    const { result } = renderHook(() => useMyTimekeepingMatch(ME));
    act(() => refreshMyTimekeepingMatch(CLIENT, ME));
    await flush();
    mockGetMyTimekeepingMatch.mockResolvedValue({ ok: true, data: null });
    act(() => refreshMyTimekeepingMatch(CLIENT, ME));
    await flush();
    expect(result.current).toBeNull();
  });

  it("a clear (sign-out) empties the slot, and a read issued before it never writes after it", async () => {
    let resolveOld!: (v: unknown) => void;
    mockGetMyTimekeepingMatch.mockReturnValueOnce(new Promise((r) => (resolveOld = r)));
    const { result } = renderHook(() => useMyTimekeepingMatch(ME));
    act(() => refreshMyTimekeepingMatch(CLIENT, ME));
    act(() => refreshMyTimekeepingMatch(CLIENT, null));
    await act(async () => resolveOld({ ok: true, data: match() }));
    await flush();
    expect(result.current).toBeNull();
    expect(mockGetMyTimekeepingMatch).toHaveBeenCalledTimes(1);
  });

  it("a recorded match drops out of every reader at its edit window's close on this clock, with no read", async () => {
    jest.useFakeTimers({ now: Date.parse("2026-10-20T12:06:00.000Z") });
    try {
      const closes = Date.now() + 60_000;
      mockGetMyTimekeepingMatch.mockResolvedValue({
        ok: true,
        data: match({ status: "completed", editOpen: true, editClosesAt: new Date(closes).toISOString() }),
      });
      const { result } = renderHook(() => useMyTimekeepingMatch(ME));
      act(() => refreshMyTimekeepingMatch(CLIENT, ME));
      await flush();
      expect(result.current?.matchId).toBe("tk-1");
      act(() => {
        jest.advanceTimersByTime(59_999);
      });
      expect(result.current?.matchId).toBe("tk-1");
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current).toBeNull();
      expect(mockGetMyTimekeepingMatch).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a throwing reader never reaches the caller", () => {
    mockGetMyTimekeepingMatch.mockImplementation(() => {
      throw new Error("not a function");
    });
    expect(() => refreshMyTimekeepingMatch(CLIENT, ME)).not.toThrow();
  });
});
