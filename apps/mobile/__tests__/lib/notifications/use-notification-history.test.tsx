/**
 * Bell feed (jr_be spec 014 section 16.6.4): ready-reel items merged into the
 * challenge / match-result history, newest first, only reels with a ledger
 * row (`notifiedAt`), none with clips off, unread from `unseen`, and the
 * unseen count that feeds the badge. The highlight half re-reads on focus and
 * foreground; a failed highlight read never breaks the bell.
 */
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

const mockFocus: (() => void)[] = [];
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void) => {
    const R = require("react");
    R.useEffect(() => {
      mockFocus.push(cb);
      cb();
    }, [cb]);
  },
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

const mockHistory = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getNotificationHistory: (...a: unknown[]) => mockHistory(...a),
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
    ...over,
  };
}

const CHALLENGE = {
  id: "c1",
  type: "challenge_received" as const,
  title: "New challenge",
  body: "x",
  route: "/session/s-1",
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
  jest.clearAllMocks();
  mockFocus.length = 0;
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

  it("uses the regeneration title for a later version and a fallback without an opponent", () => {
    const [row] = toHighlightNotificationItems([hl({ version: 2, opponentName: null })]);
    expect(row.title).toBe("Your new version is ready");
    expect(row.body).toBe("Your match reel is ready to watch.");
    expect(row.id).toBe("highlight-h1-v2");
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
  it("merges highlight rows into the feed and counts the unseen ones", async () => {
    const { result } = renderHook(() => useNotificationHistory("a1"));
    await settle();
    expect(mockGetMy).toHaveBeenCalledWith({}, { limit: 10 });
    expect(result.current.items.map((i) => i.id)).toEqual([
      "c1",
      "highlight-h1-v1",
      "highlight-h2-v1",
      "r1",
    ]);
    expect(result.current.unseenHighlights).toBe(1);
  });

  it("lists no highlight rows with clips disabled", async () => {
    mockGetMy.mockResolvedValue({ ok: true, data: { clipsEnabled: false, shareEnabled: false, items: [hl()] } });
    const { result } = renderHook(() => useNotificationHistory("a1"));
    await settle();
    expect(result.current.items.map((i) => i.id)).toEqual(["c1", "r1"]);
    expect(result.current.unseenHighlights).toBe(0);
  });

  it("keeps the rest of the bell when the highlight read fails or throws", async () => {
    mockGetMy.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const a = renderHook(() => useNotificationHistory("a1"));
    await settle();
    expect(a.result.current.items.map((i) => i.id)).toEqual(["c1", "r1"]);
    a.unmount();

    mockGetMy.mockRejectedValue(new Error("boom"));
    const b = renderHook(() => useNotificationHistory("a1"));
    await settle();
    expect(b.result.current.items.map((i) => i.id)).toEqual(["c1", "r1"]);
  });

  it("re-reads only the highlight half on focus (not the first) and on foreground", async () => {
    const { result } = renderHook(() => useNotificationHistory("a1"));
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(1);

    mockGetMy.mockResolvedValue({ ok: true, data: { clipsEnabled: true, shareEnabled: true, items: [hl({ unseen: false })] } });
    act(() => mockFocus.forEach((cb) => cb()));
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(2);
    expect(mockHistory).toHaveBeenCalledTimes(1);
    expect(result.current.unseenHighlights).toBe(0);

    act(() => appStateListener?.("active"));
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(3);
    expect(mockHistory).toHaveBeenCalledTimes(1);
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
