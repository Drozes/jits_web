/**
 * Bell feed (jr_be spec 015 section 16.6.4): ready-reel items merged into the
 * challenge / match-result history, newest first, only reels with a ledger
 * row (`notifiedAt`), none with clips off, unread from `unseen`, and the
 * unseen count that feeds the badge. The highlight half re-reads when a
 * header bell gains focus (bell-store `notifyBellFocused`, jits-dq85.7); a
 * return to the foreground re-reads both halves; a failed highlight read
 * never breaks the bell.
 */
import * as React from "react";
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

// mockHistory resolves to the feed rows, or to FAILED for a read whose query
// returned an error (the real fetch never throws for those).
const mockHistory = jest.fn();
const FAILED = { failed: true } as const;
jest.mock("@jits/shared/api/queries", () => ({
  getNotificationHistoryResult: async (...a: unknown[]) => {
    const rows = await mockHistory(...a);
    return Array.isArray(rows) ? { ok: true, items: rows } : { ok: false };
  },
}));

const mockGetMy = jest.fn();
jest.mock("@jits/shared/api/highlight-share", () => ({
  getMyHighlights: (...a: unknown[]) => mockGetMy(...a),
}));

import { useNotificationHistory } from "@/hooks/use-notification-history";
import {
  mergeBellItems,
  toHighlightNotificationItems,
} from "@/lib/notifications/notification-items";
import {
  __setHighlightReadThrottleForTests,
  notifyHighlightsChanged,
  requestBellRefresh,
  resetHighlightStore,
} from "@/lib/highlight/highlight-store";
import * as highlightStore from "@/lib/highlight/highlight-store";
import { notifyBellFocused, resetBellStore } from "@/lib/notifications/bell-store";

function hl(over: Record<string, unknown> = {}) {
  return {
    highlightId: "h1",
    matchId: "m1",
    matchVideoId: "v1",
    version: 1,
    durationS: 30,
    posterPath: null,
    readyAt: "2026-09-27T10:00:00Z",
    opponentName: "Demo Red",
    matchType: "ranked" as const,
    outcome: "win" as const,
    playedAt: "2026-09-27T09:00:00Z",
    notifiedAt: "2026-09-27T10:00:00Z",
    unseen: true,
    origin: null as "auto" | "regen" | "retry" | null,
    ...over,
  };
}

const CHALLENGE = {
  id: "c1",
  type: "challenge_received" as const,
  title: "New challenge",
  body: "x",
  createdAt: "2026-09-27T11:00:00Z",
};
const RESULT = {
  id: "r1",
  type: "match_result" as const,
  title: "Match result",
  body: "y",
  createdAt: "2026-09-27T08:00:00Z",
};

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

let appStateListener: ((s: string) => void) | null = null;

beforeEach(() => {
  resetHighlightStore();
  __setHighlightReadThrottleForTests(0); // these suites test refresh wiring, not the dedupe
  jest.clearAllMocks();
  resetBellStore();
  mockHistory.mockResolvedValue([CHALLENGE, RESULT]);
  mockGetMy.mockResolvedValue({
    ok: true,
    data: { clipsEnabled: true, shareEnabled: true, items: [hl(), hl({ highlightId: "h2", unseen: false, notifiedAt: "2026-09-27T09:30:00Z" })] },
  });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_t, fn) => {
    appStateListener = fn as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
});

afterEach(() => jest.restoreAllMocks());

describe("toHighlightNotificationItems", () => {
  it("maps a notified reel to a bell row with the exact copy and the bell route", () => {
    expect(toHighlightNotificationItems([hl()])).toEqual([
      {
        type: "highlight_ready",
        id: "highlight-h1-v1",
        title: "Your highlight is ready",
        body: "Your reel vs Demo Red is ready to watch.",
        route: "/highlight/h1?source=bell",
        createdAt: "2026-09-27T10:00:00Z",
        unread: true,
      },
    ]);
  });

  it("uses the regeneration title for origin regen and a fallback without an opponent", () => {
    const [row] = toHighlightNotificationItems([hl({ version: 2, origin: "regen", opponentName: null })]);
    expect(row.title).toBe("Your new version is ready");
    expect(row.body).toBe("Your match reel is ready to watch.");
    expect(row.id).toBe("highlight-h1-v2");
  });

  it.each([
    ["auto", 1],
    ["retry", 1],
    [null, 1],
    ["auto", 3],
    ["retry", 2],
    [null, 4],
  ] as const)("origin %p (version %i) reads Your highlight is ready (no version guess)", (origin, version) => {
    const [row] = toHighlightNotificationItems([hl({ version, origin })]);
    expect(row.title).toBe("Your highlight is ready");
  });

  it("origin regen reads Your new version is ready even on version 1", () => {
    const [row] = toHighlightNotificationItems([hl({ version: 1, origin: "regen" })]);
    expect(row.title).toBe("Your new version is ready");
  });

  it("skips reels the athlete was never notified about", () => {
    expect(toHighlightNotificationItems([hl({ notifiedAt: null })])).toEqual([]);
  });

  it("merges newest first", () => {
    const merged = mergeBellItems([CHALLENGE, RESULT], toHighlightNotificationItems([hl()]));
    expect(merged.map((m) => m.id)).toEqual(["c1", "highlight-h1-v1", "r1"]);
  });
});

describe("useNotificationHistory", () => {
  it("reads the history and the highlight rows and counts the unseen ones", async () => {
    const { result } = renderHook(() => useNotificationHistory("a1"));
    await settle();
    expect(mockGetMy).toHaveBeenCalledWith({}, { limit: 10 });
    expect(result.current.history.map((i) => i.id)).toEqual(["c1", "r1"]);
    expect(result.current.highlights.map((i) => i.id)).toEqual(["highlight-h1-v1", "highlight-h2-v1"]);
    expect("items" in result.current).toBe(false);
    expect(result.current.unseenHighlights).toBe(1);
  });

  it("lists no highlight rows with clips disabled", async () => {
    mockGetMy.mockResolvedValue({ ok: true, data: { clipsEnabled: false, shareEnabled: false, items: [hl()] } });
    const { result } = renderHook(() => useNotificationHistory("a1"));
    await settle();
    expect(result.current.history.map((i) => i.id)).toEqual(["c1", "r1"]);
    expect(result.current.highlights).toEqual([]);
    expect(result.current.unseenHighlights).toBe(0);
  });

  it("keeps the rest of the bell when the highlight read fails or throws", async () => {
    mockGetMy.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const a = renderHook(() => useNotificationHistory("a1"));
    await settle();
    expect(a.result.current.history.map((i) => i.id)).toEqual(["c1", "r1"]);
    expect(a.result.current.highlights).toEqual([]);
    a.unmount();

    mockGetMy.mockRejectedValue(new Error("boom"));
    const b = renderHook(() => useNotificationHistory("a1"));
    await settle();
    expect(b.result.current.history.map((i) => i.id)).toEqual(["c1", "r1"]);
    expect(b.result.current.highlights).toEqual([]);
  });

  it("re-reads only the highlight half when a header bell gains focus; both halves on foreground", async () => {
    const { result } = renderHook(() => useNotificationHistory("a1"));
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(1);

    mockGetMy.mockResolvedValue({ ok: true, data: { clipsEnabled: true, shareEnabled: true, items: [hl({ unseen: false })] } });
    act(() => notifyBellFocused());
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(2);
    expect(mockHistory).toHaveBeenCalledTimes(1);
    expect(result.current.unseenHighlights).toBe(0);

    // iOS inactive -> active (notification shade, app switcher) is not a foreground.
    act(() => appStateListener?.("inactive"));
    act(() => appStateListener?.("active"));
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(2);

    expect(mockHistory).toHaveBeenCalledTimes(1);

    // A match result that landed while the app was backgrounded shows on return.
    mockHistory.mockResolvedValue([CHALLENGE, RESULT, { ...RESULT, id: "r2", createdAt: "2026-09-27T12:00:00Z" }]);
    act(() => appStateListener?.("background"));
    act(() => appStateListener?.("active"));
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(3);
    expect(mockHistory).toHaveBeenCalledTimes(2);
    expect(result.current.history.map((i) => i.id)).toContain("r2");
  });

  it("a header focus that lands right after mount does not repeat the mount read", async () => {
    // readMyHighlights dedupes in-flight reads, so the RPC count alone would
    // hide a repeated read; count the hook's reads instead.
    const reads = jest.spyOn(highlightStore, "readMyHighlights");
    // The first tab root's bell focuses in the same commit that mounts the
    // host, before the host's own effects run.
    renderHook(() => {
      React.useEffect(() => notifyBellFocused(), []);
      return useNotificationHistory("a1");
    });
    await settle();
    expect(reads).toHaveBeenCalledTimes(1);
    expect(mockHistory).toHaveBeenCalledTimes(1);

    // Once the mount read settled, a focus re-reads the reels again.
    act(() => notifyBellFocused());
    await settle();
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it("a failed history read keeps the previous feed and refresh() resolves", async () => {
    const { result } = renderHook(() => useNotificationHistory("a1"));
    await settle();
    mockHistory.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await expect(result.current.refresh()).resolves.toBeUndefined();
    });
    expect(result.current.history.map((i) => i.id)).toEqual(["c1", "r1"]);
  });

  it("re-reads the highlight half (forced) when a reel is marked seen elsewhere", async () => {
    const { result } = renderHook(() => useNotificationHistory("a1"));
    await settle();
    expect(result.current.unseenHighlights).toBe(1);
    mockGetMy.mockResolvedValue({ ok: true, data: { clipsEnabled: true, shareEnabled: true, items: [hl({ unseen: false })] } });
    act(() => notifyHighlightsChanged());
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(2);
    expect(mockHistory).toHaveBeenCalledTimes(1);
    expect(result.current.unseenHighlights).toBe(0);
  });

  it("only the newest highlight read writes (a slow focus read never overwrites a forced one)", async () => {
    const { result } = renderHook(() => useNotificationHistory("a1"));
    await settle();
    expect(result.current.unseenHighlights).toBe(1);
    let resolveSlow: (v: unknown) => void = () => undefined;
    mockGetMy.mockReturnValueOnce(new Promise((r) => (resolveSlow = r)));
    act(() => notifyBellFocused()); // slow read, still reports unseen
    mockGetMy.mockResolvedValueOnce({ ok: true, data: { clipsEnabled: true, shareEnabled: true, items: [hl({ unseen: false })] } });
    act(() => notifyHighlightsChanged()); // forced read after a seen mark
    await settle();
    expect(result.current.unseenHighlights).toBe(0);
    await act(async () =>
      resolveSlow({ ok: true, data: { clipsEnabled: true, shareEnabled: true, items: [hl()] } }),
    );
    await settle();
    expect(result.current.unseenHighlights).toBe(0);
  });

  it("only the newest full read writes history (a slow mount read never overwrites a forced one)", async () => {
    let resolveSlow: (v: unknown) => void = () => undefined;
    mockHistory.mockReturnValueOnce(new Promise((r) => (resolveSlow = r)));
    const { result } = renderHook(() => useNotificationHistory("a1"));
    await settle();
    // A match result completed in between; the panel open reads it.
    const NEWER = { ...RESULT, id: "r2", createdAt: "2026-09-27T12:00:00Z" };
    mockHistory.mockResolvedValueOnce([NEWER, CHALLENGE, RESULT]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.history.map((i) => i.id)).toEqual(["r2", "c1", "r1"]);
    await act(async () => resolveSlow([CHALLENGE, RESULT]));
    await settle();
    expect(result.current.history.map((i) => i.id)).toEqual(["r2", "c1", "r1"]);
  });

  it("a forced read whose query errors keeps the feed from the mount read", async () => {
    const { result } = renderHook(() => useNotificationHistory("a1"));
    await settle();
    mockHistory.mockResolvedValueOnce(FAILED);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.history.map((i) => i.id)).toEqual(["c1", "r1"]);
  });

  it("a failed newer read never throws away an older mount read that succeeds later", async () => {
    for (const failure of ["error", "reject"] as const) {
      let resolveSlow: (v: unknown) => void = () => undefined;
      mockHistory.mockReturnValueOnce(new Promise((r) => (resolveSlow = r)));
      const { result, unmount } = renderHook(() => useNotificationHistory("a1"));
      await settle();
      if (failure === "error") mockHistory.mockResolvedValueOnce(FAILED);
      else mockHistory.mockRejectedValueOnce(new Error("offline"));
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.history).toEqual([]);
      await act(async () => resolveSlow([CHALLENGE, RESULT]));
      await settle();
      expect(result.current.history.map((i) => i.id)).toEqual(["c1", "r1"]);
      unmount();
    }
  });

  it("Home's pull-to-refresh re-reads the whole bell feed", async () => {
    renderHook(() => useNotificationHistory("a1"));
    await settle();
    act(() => requestBellRefresh());
    await settle();
    expect(mockHistory).toHaveBeenCalledTimes(2);
    expect(mockGetMy).toHaveBeenCalledTimes(2);
  });

  it("refresh() re-reads both halves", async () => {
    const { result } = renderHook(() => useNotificationHistory("a1"));
    await settle();
    await act(async () => {
      await result.current.refresh();
    });
    expect(mockHistory).toHaveBeenCalledTimes(2);
    expect(mockGetMy).toHaveBeenCalledTimes(2);
  });
});
