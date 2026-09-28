/**
 * Home's "Your new highlight" source (jr_be spec 014 section 16.6.4):
 * `getMyHighlights({ limit: 1, unseenOnly: true })`, shown only for an unseen
 * item with clips on, re-read on focus / foreground / match exit / pull,
 * dismiss marks seen + logs `home_card_dismissed`, newest read wins.
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

let mockExits = 0;
jest.mock("@/lib/arena/arena-store", () => ({ useMatchExitCount: () => mockExits }));

const mockSignPoster = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  signPosterKey: (...a: unknown[]) => mockSignPoster(...a),
}));

const mockGetMy = jest.fn();
const mockMarkSeen = jest.fn();
const mockLog = jest.fn();
jest.mock("@jits/shared/api/highlight-share", () => ({
  getMyHighlights: (...a: unknown[]) => mockGetMy(...a),
  markHighlightSeen: (...a: unknown[]) => mockMarkSeen(...a),
  logHighlightShareEvent: (...a: unknown[]) => mockLog(...a),
}));

import { useNewHighlight } from "@/lib/highlight/use-new-highlight";

function item(over: Record<string, unknown> = {}) {
  return {
    highlightId: "h1",
    matchId: "m1",
    matchVideoId: "v1",
    version: 1,
    durationS: 31.2,
    posterPath: "m1/a/highlights/1.jpg",
    readyAt: "2026-09-27T10:00:00Z",
    opponentName: "Demo Red",
    matchType: "ranked",
    outcome: "win",
    playedAt: "2026-09-27T09:00:00Z",
    notifiedAt: "2026-09-27T10:00:01Z",
    unseen: true,
    ...over,
  };
}

function ok(items: unknown[], clipsEnabled = true) {
  return { ok: true, data: { clipsEnabled, shareEnabled: true, items } };
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

let appStateListener: ((s: string) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus.length = 0;
  mockExits = 0;
  mockGetMy.mockResolvedValue(ok([item()]));
  mockSignPoster.mockResolvedValue("https://signed/poster.jpg");
  mockMarkSeen.mockResolvedValue({ ok: true, data: null });
  mockLog.mockResolvedValue(undefined);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_t, fn) => {
    appStateListener = fn as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useNewHighlight", () => {
  it("reads the latest unseen reel and signs its poster", async () => {
    const { result } = renderHook(() => useNewHighlight("a1"));
    await settle();
    expect(mockGetMy).toHaveBeenCalledWith({}, { limit: 1, unseenOnly: true });
    expect(mockSignPoster).toHaveBeenCalledWith({}, "m1/a/highlights/1.jpg", 3600);
    expect(result.current.highlight?.item.highlightId).toBe("h1");
    expect(result.current.highlight?.posterUrl).toBe("https://signed/poster.jpg");
  });

  it("shows nothing when there is no unseen reel", async () => {
    mockGetMy.mockResolvedValue(ok([]));
    const { result } = renderHook(() => useNewHighlight("a1"));
    await settle();
    expect(result.current.highlight).toBeNull();
  });

  it("shows nothing for an item that is not unseen (defensive)", async () => {
    mockGetMy.mockResolvedValue(ok([item({ unseen: false })]));
    const { result } = renderHook(() => useNewHighlight("a1"));
    await settle();
    expect(result.current.highlight).toBeNull();
  });

  it("is hidden when clips are disabled", async () => {
    mockGetMy.mockResolvedValue(ok([item()], false));
    const { result } = renderHook(() => useNewHighlight("a1"));
    await settle();
    expect(result.current.highlight).toBeNull();
  });

  it("reads nothing without an athlete", async () => {
    const { result } = renderHook(() => useNewHighlight(undefined));
    await settle();
    expect(mockGetMy).not.toHaveBeenCalled();
    expect(result.current.highlight).toBeNull();
  });

  it("keeps the card when a re-read fails", async () => {
    const { result } = renderHook(() => useNewHighlight("a1"));
    await settle();
    mockGetMy.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    act(() => result.current.refresh());
    await settle();
    expect(result.current.highlight?.item.highlightId).toBe("h1");
  });

  it("does not re-sign the poster for an unchanged item", async () => {
    const { result } = renderHook(() => useNewHighlight("a1"));
    await settle();
    act(() => result.current.refresh());
    await settle();
    expect(mockGetMy).toHaveBeenCalledTimes(2);
    expect(mockSignPoster).toHaveBeenCalledTimes(1);
  });

  describe("refresh triggers", () => {
    it("re-reads on focus", async () => {
      renderHook(() => useNewHighlight("a1"));
      await settle();
      act(() => mockFocus.forEach((cb) => cb()));
      await settle();
      expect(mockGetMy).toHaveBeenCalledTimes(2);
    });

    it("re-reads on return to the foreground, not on background", async () => {
      renderHook(() => useNewHighlight("a1"));
      await settle();
      act(() => appStateListener?.("background"));
      act(() => appStateListener?.("active"));
      await settle();
      expect(mockGetMy).toHaveBeenCalledTimes(2);
    });

    it("re-reads when a match screen closes", async () => {
      const { rerender } = renderHook(() => useNewHighlight("a1"));
      await settle();
      mockExits = 1;
      rerender({});
      await settle();
      expect(mockGetMy).toHaveBeenCalledTimes(2);
    });

    it("re-reads on refresh() (pull to refresh) and drops a reel that is now seen", async () => {
      const { result } = renderHook(() => useNewHighlight("a1"));
      await settle();
      mockGetMy.mockResolvedValue(ok([]));
      act(() => result.current.refresh());
      await settle();
      expect(result.current.highlight).toBeNull();
    });
  });

  it("only the newest read writes", async () => {
    let resolveFirst: (v: unknown) => void = () => undefined;
    mockGetMy.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)));
    mockGetMy.mockResolvedValueOnce(ok([]));
    const { result } = renderHook(() => useNewHighlight("a1"));
    act(() => result.current.refresh());
    await settle();
    await act(async () => resolveFirst(ok([item()])));
    await settle();
    expect(result.current.highlight).toBeNull();
  });

  it("dismiss hides it, marks the version seen and logs home_card_dismissed", async () => {
    mockGetMy.mockResolvedValue(ok([item({ version: 3 })]));
    const { result } = renderHook(() => useNewHighlight("a1"));
    await settle();
    act(() => result.current.dismiss());
    expect(result.current.highlight).toBeNull();
    expect(mockMarkSeen).toHaveBeenCalledWith({}, "h1", 3);
    expect(mockLog).toHaveBeenCalledWith({}, "h1", "home_card_dismissed", expect.objectContaining({ source: "home", platform: expect.any(String), app_version: null, runtime_version: expect.anything() }));

    // A read that still reports it unseen (the mark not landed yet) keeps it hidden.
    act(() => result.current.refresh());
    await settle();
    expect(result.current.highlight).toBeNull();
  });

  it("a newer version after a dismiss shows again", async () => {
    const { result } = renderHook(() => useNewHighlight("a1"));
    await settle();
    act(() => result.current.dismiss());
    mockGetMy.mockResolvedValue(ok([item({ version: 2 })]));
    act(() => result.current.refresh());
    await settle();
    expect(result.current.highlight?.item.version).toBe(2);
  });
});
