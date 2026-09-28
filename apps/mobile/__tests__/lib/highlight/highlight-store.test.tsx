/**
 * The shared discovery store (integration review, discovery m1-m3): one
 * deduped / throttled `get_my_highlights` read for every bell + the Home
 * card, forced reads, the change and bell-refresh signals, and the
 * foreground hook that ignores iOS inactive -> active.
 */
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "sb" } }));
const mockGetMy = jest.fn();
jest.mock("@jits/shared/api/highlight-share", () => ({
  getMyHighlights: (...a: unknown[]) => mockGetMy(...a),
}));

import {
  HIGHLIGHT_READ_THROTTLE_MS,
  notifyHighlightsChanged,
  readMyHighlights,
  requestBellRefresh,
  resetHighlightStore,
  useBellRefreshCount,
  useForegroundEffect,
  useHighlightsChangedCount,
} from "@/lib/highlight/highlight-store";

const OK = { ok: true, data: { clipsEnabled: true, shareEnabled: true, items: [] } };
let listener: ((s: string) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  resetHighlightStore();
  mockGetMy.mockResolvedValue(OK);
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, fn: (s: string) => void) => {
    listener = fn;
    return { remove: jest.fn() };
  }) as never);
});

afterEach(() => jest.restoreAllMocks());

describe("readMyHighlights", () => {
  it("joins concurrent reads with the same options (four bells + Home: one RPC per query)", async () => {
    const reads = [1, 2, 3, 4].map(() => readMyHighlights({ limit: 10 }));
    const home = readMyHighlights({ limit: 1, unseenOnly: true });
    await Promise.all([...reads, home]);
    expect(mockGetMy).toHaveBeenCalledTimes(2);
    expect(mockGetMy).toHaveBeenCalledWith({ tag: "sb" }, { limit: 10 });
    expect(mockGetMy).toHaveBeenCalledWith({ tag: "sb" }, { limit: 1, unseenOnly: true });
  });

  it("reuses a read within the throttle window, reads again after it", async () => {
    const now = jest.spyOn(Date, "now");
    let t = 5_000;
    now.mockImplementation(() => t);
    await readMyHighlights({ limit: 10 });
    t += HIGHLIGHT_READ_THROTTLE_MS - 1;
    await readMyHighlights({ limit: 10 });
    expect(mockGetMy).toHaveBeenCalledTimes(1);
    t += 2;
    await readMyHighlights({ limit: 10 });
    expect(mockGetMy).toHaveBeenCalledTimes(2);
  });

  it("force always reads fresh", async () => {
    await readMyHighlights({ limit: 10 });
    await readMyHighlights({ limit: 10 }, { force: true });
    expect(mockGetMy).toHaveBeenCalledTimes(2);
  });

  it("a change notification drops the cached read", async () => {
    await readMyHighlights({ limit: 10 });
    notifyHighlightsChanged();
    await readMyHighlights({ limit: 10 });
    expect(mockGetMy).toHaveBeenCalledTimes(2);
  });
});

describe("signals", () => {
  it("notifyHighlightsChanged and requestBellRefresh bump their counters", () => {
    const changed = renderHook(() => useHighlightsChangedCount());
    const bell = renderHook(() => useBellRefreshCount());
    const [c0, b0] = [changed.result.current, bell.result.current];
    act(() => notifyHighlightsChanged());
    expect(changed.result.current).toBe(c0 + 1);
    act(() => requestBellRefresh());
    expect(bell.result.current).toBe(b0 + 1);
  });
});

describe("useForegroundEffect", () => {
  it("fires only on background -> active, never on inactive -> active", () => {
    const cb = jest.fn();
    renderHook(() => useForegroundEffect(cb));
    act(() => listener?.("inactive"));
    act(() => listener?.("active"));
    expect(cb).not.toHaveBeenCalled();
    act(() => listener?.("background"));
    act(() => listener?.("active"));
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => listener?.("active"));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
