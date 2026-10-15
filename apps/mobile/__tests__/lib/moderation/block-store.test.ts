/**
 * The block store (jits-rog5.11, App Review 1.2): one read per session of
 * both sets, the list filter, and block / unblock updating the sets at once.
 */
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockNotifyFriendsChanged = jest.fn();
jest.mock("@/lib/invites/use-friend-ids", () => ({ notifyFriendsChanged: () => mockNotifyFriendsChanged() }));

const mockApi = {
  getMyBlockIds: jest.fn(),
  getMyBlockedAthletes: jest.fn(),
  blockAthlete: jest.fn(),
  unblockAthlete: jest.fn(),
};
jest.mock("@jits/shared/api/moderation", () => ({
  getMyBlockIds: (...a: unknown[]) => mockApi.getMyBlockIds(...a),
  getMyBlockedAthletes: (...a: unknown[]) => mockApi.getMyBlockedAthletes(...a),
  blockAthlete: (...a: unknown[]) => mockApi.blockAthlete(...a),
  unblockAthlete: (...a: unknown[]) => mockApi.unblockAthlete(...a),
}));

import {
  BLOCKS_SETTLE_TIMEOUT_MS,
  __resetBlocksForTests,
  blockAndRefresh,
  isBlocked,
  loadBlocks,
  unblockAndRefresh,
  useBlockState,
  withoutBlocked,
} from "@/lib/moderation/block-store";
import { act, renderHook } from "@testing-library/react-native";

const ROW = { athlete_id: "b-1", display_name: "Blocked One", blocked_at: "2026-10-14T10:00:00Z" };

beforeEach(() => {
  jest.clearAllMocks();
  __resetBlocksForTests();
  mockApi.getMyBlockIds.mockResolvedValue({ ok: true, data: ["b-1", "them-2"] });
  mockApi.getMyBlockedAthletes.mockResolvedValue({ ok: true, data: [ROW] });
  mockApi.blockAthlete.mockResolvedValue({ ok: true, data: undefined });
  mockApi.unblockAthlete.mockResolvedValue({ ok: true, data: undefined });
});

describe("withoutBlocked", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("drops anyone in the set and keeps the order", () => {
    expect(withoutBlocked(rows, (r) => r.id, new Set(["b"]))).toEqual([{ id: "a" }, { id: "c" }]);
  });
  it("returns the same array when nothing is filtered (no re-render churn)", () => {
    expect(withoutBlocked(rows, (r) => r.id, new Set())).toBe(rows);
    expect(withoutBlocked(rows, (r) => r.id, new Set(["zzz"]))).toBe(rows);
  });
  it("keeps rows with no id", () => {
    expect(withoutBlocked([{ id: null }], (r) => r.id, new Set(["b"]))).toEqual([{ id: null }]);
  });
});

describe("loadBlocks", () => {
  it("reads both sets for the athlete: either direction in ids, mine separately", async () => {
    await expect(loadBlocks("me")).resolves.toBe(true);
    const { result } = renderHook(() => useBlockState());
    expect(result.current.loaded).toBe(true);
    expect([...result.current.ids].sort()).toEqual(["b-1", "them-2"]);
    expect([...result.current.mine]).toEqual(["b-1"]);
    expect(result.current.blockedList).toEqual([ROW]);
    expect(isBlocked("them-2")).toBe(true);
    expect(isBlocked("someone")).toBe(false);
  });

  it("a failed read keeps the last known sets", async () => {
    await loadBlocks("me");
    mockApi.getMyBlockIds.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "" } });
    mockApi.getMyBlockedAthletes.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "" } });
    await expect(loadBlocks("me")).resolves.toBe(false);
    expect(isBlocked("them-2")).toBe(true);
  });

  it("a stalled first read settles after 10 s, so a waiting profile never hangs", async () => {
    jest.useFakeTimers();
    try {
      mockApi.getMyBlockIds.mockReturnValue(new Promise(() => undefined));
      void loadBlocks("me");
      const { result } = renderHook(() => useBlockState());
      expect(result.current.settled).toBe(false);
      act(() => {
        jest.advanceTimersByTime(BLOCKS_SETTLE_TIMEOUT_MS);
      });
      expect(result.current.settled).toBe(true);
      expect(result.current.loaded).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("signing out (null) clears everything and reads nothing", async () => {
    await loadBlocks("me");
    mockApi.getMyBlockIds.mockClear();
    await loadBlocks(null);
    expect(isBlocked("b-1")).toBe(false);
    expect(mockApi.getMyBlockIds).not.toHaveBeenCalled();
  });

  it("a read for the previous athlete never lands on the next one", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockApi.getMyBlockIds.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const first = loadBlocks("me");
    await loadBlocks("other");
    resolve({ ok: true, data: ["stale"] });
    await first;
    expect(isBlocked("stale")).toBe(false);
  });
});

describe("block and unblock", () => {
  it("block adds the athlete to both sets at once, tells the friend list and re-reads", async () => {
    await loadBlocks("me");
    mockApi.getMyBlockIds.mockResolvedValue({ ok: true, data: ["b-1", "them-2", "new-3"] });
    const res = await blockAndRefresh("new-3", "New Three");
    expect(res.ok).toBe(true);
    expect(mockApi.blockAthlete).toHaveBeenCalledWith({}, "new-3");
    expect(isBlocked("new-3")).toBe(true);
    expect(mockNotifyFriendsChanged).toHaveBeenCalledTimes(1);
  });

  it("a refused block changes nothing", async () => {
    await loadBlocks("me");
    mockApi.blockAthlete.mockResolvedValue({ ok: false, error: { hint: "cannot_block_self", message: "" } });
    const res = await blockAndRefresh("me", "Me");
    expect(res.ok).toBe(false);
    expect(isBlocked("me")).toBe(false);
    expect(mockNotifyFriendsChanged).not.toHaveBeenCalled();
  });

  it("unblock removes the athlete from my list and the filter", async () => {
    await loadBlocks("me");
    mockApi.getMyBlockIds.mockResolvedValue({ ok: true, data: ["them-2"] });
    mockApi.getMyBlockedAthletes.mockResolvedValue({ ok: true, data: [] });
    await unblockAndRefresh("b-1");
    const { result } = renderHook(() => useBlockState());
    expect(result.current.mine.has("b-1")).toBe(false);
    expect(result.current.blockedList).toEqual([]);
    expect(isBlocked("b-1")).toBe(false);
  });
});
