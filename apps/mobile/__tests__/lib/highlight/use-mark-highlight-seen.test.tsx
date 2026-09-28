/**
 * useMarkHighlightSeen (viewer + match-detail card): once per version, never
 * without an id or version, and a landed mark tells the bell and the Home
 * card to re-read (integration review, discovery m1).
 */
import { renderHook, act } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "sb" } }));
const mockMark = jest.fn();
jest.mock("@jits/shared/api/highlight-share", () => ({
  markHighlightSeen: (...a: unknown[]) => mockMark(...a),
}));

import { useMarkHighlightSeen } from "@/lib/highlight/use-mark-highlight-seen";
import { resetHighlightStore, useHighlightsChangedCount } from "@/lib/highlight/highlight-store";

const flush = () => act(async () => {});

beforeEach(() => {
  jest.clearAllMocks();
  resetHighlightStore();
  mockMark.mockResolvedValue({ ok: true, data: null });
});

describe("useMarkHighlightSeen", () => {
  it("marks once per version and bumps the change signal when it lands", async () => {
    const counter = renderHook(() => useHighlightsChangedCount());
    const before = counter.result.current;
    const { rerender } = renderHook(({ v }: { v: number }) => useMarkHighlightSeen("h1", v), {
      initialProps: { v: 1 },
    });
    await flush();
    rerender({ v: 1 });
    await flush();
    expect(mockMark).toHaveBeenCalledTimes(1);
    expect(counter.result.current).toBe(before + 1);
    rerender({ v: 2 });
    await flush();
    expect(mockMark).toHaveBeenLastCalledWith({ tag: "sb" }, "h1", 2);
    expect(counter.result.current).toBe(before + 2);
  });

  it("does nothing without an id or a version", async () => {
    renderHook(() => useMarkHighlightSeen(null, 1));
    renderHook(() => useMarkHighlightSeen("h1", null));
    await flush();
    expect(mockMark).not.toHaveBeenCalled();
  });

  it("a failed mark does not bump the signal", async () => {
    mockMark.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const counter = renderHook(() => useHighlightsChangedCount());
    const before = counter.result.current;
    renderHook(() => useMarkHighlightSeen("h1", 1));
    await flush();
    expect(counter.result.current).toBe(before);
  });
});
