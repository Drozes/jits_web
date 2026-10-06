/**
 * Every angle's breakdown, read up front (jits-xfvd.16, contract 4.4).
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockGetVideoAnalysis = jest.fn();
jest.mock("@jits/shared/api/film-room", () => ({
  getVideoAnalysis: (...a: unknown[]) => mockGetVideoAnalysis(...a),
}));

import { useAngleAnalyses } from "@/lib/film-room/use-angle-analyses";

type Resolve = (v: unknown) => void;
const pending: Record<string, Resolve> = {};

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(pending)) delete pending[k];
  mockGetVideoAnalysis.mockImplementation(
    (_c: unknown, id: string) =>
      new Promise((resolve) => {
        pending[id] = resolve;
      }),
  );
});

const analysis = (summary: string) => ({ summary, positions: [], scoring_moments: [], technique_tags: [] });

describe("useAngleAnalyses", () => {
  it("reads every id at once, in parallel", async () => {
    const { result } = renderHook(() => useAngleAnalyses(["a", "b", "c"]));
    expect(mockGetVideoAnalysis.mock.calls.map((c) => c[1])).toEqual(["a", "b", "c"]);
    expect(result.current.stateFor("a")).toBe("loading");
    await act(async () => {
      pending.b({ ok: true, data: analysis("B") });
    });
    expect(result.current.analysisFor("b")).toMatchObject({ summary: "B" });
    expect(result.current.stateFor("b")).toBe("ready");
    // a and c are still in flight: b did not wait on them.
    expect(result.current.stateFor("a")).toBe("loading");
  });

  it("reads each id once (dedupe), and a changed list reads only the new ids", async () => {
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useAngleAnalyses(ids), { initialProps: { ids: ["a", "a", "b"] } });
    expect(mockGetVideoAnalysis).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending.a({ ok: true, data: analysis("A") });
      pending.b({ ok: true, data: null });
    });
    rerender({ ids: ["a", "b"] });
    rerender({ ids: ["b", "a", "c"] });
    expect(mockGetVideoAnalysis).toHaveBeenCalledTimes(3);
    expect(mockGetVideoAnalysis.mock.calls[2][1]).toBe("c");
    // Earlier results are kept.
    expect(result.current.analysisFor("a")).toMatchObject({ summary: "A" });
    expect(result.current.stateFor("b")).toBe("none");
    // Dropped from the list: still answered from what was read.
    rerender({ ids: ["c"] });
    expect(result.current.analysisFor("a")).toMatchObject({ summary: "A" });
  });

  it("reports an error read, and idle for null or an id never asked for", async () => {
    const { result } = renderHook(() => useAngleAnalyses(["a"]));
    await act(async () => {
      pending.a({ ok: false, error: { code: "UNKNOWN" } });
    });
    expect(result.current.stateFor("a")).toBe("error");
    expect(result.current.analysisFor("a")).toBeNull();
    expect(result.current.stateFor(null)).toBe("idle");
    expect(result.current.stateFor("zzz")).toBe("idle");
    expect(result.current.analysisFor(undefined)).toBeNull();
  });

  it("reads nothing for an empty list", () => {
    renderHook(() => useAngleAnalyses([]));
    expect(mockGetVideoAnalysis).not.toHaveBeenCalled();
  });

  it("drops a read that lands after unmount", async () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { result, unmount } = renderHook(() => useAngleAnalyses(["a"]));
      const before = result.current;
      unmount();
      await act(async () => {
        pending.a({ ok: true, data: analysis("A") });
      });
      await waitFor(() => expect(before.analysisFor("a")).toBeNull());
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});
