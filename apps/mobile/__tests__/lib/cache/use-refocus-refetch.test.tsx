/**
 * Focus refetch skips the first focus; the pull spinner is driven only by a
 * pull, never by a silent background refetch.
 *
 * Source: apps/mobile/lib/cache/use-refocus-refetch.ts
 */
import { act, renderHook } from "@testing-library/react-native";

const mockFocusCallbacks: (() => void)[] = [];
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void) => {
    const R = require("react");
    R.useEffect(() => {
      mockFocusCallbacks.push(cb);
      cb();
    }, [cb]);
  },
}));

import {
  REFOCUS_REFETCH_MIN_MS,
  usePullToRefresh,
  useRefetchOnRefocus,
} from "@/lib/cache/use-refocus-refetch";

let now = 1_000_000;
function focusAfter(ms: number) {
  now += ms;
  act(() => mockFocusCallbacks.forEach((cb) => cb()));
}

beforeEach(() => {
  mockFocusCallbacks.length = 0;
  jest.useRealTimers();
  jest.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useRefetchOnRefocus", () => {
  it("does not refetch on the first focus, then refetches on later ones past the throttle", () => {
    const refetch = jest.fn();
    renderHook(() => useRefetchOnRefocus(refetch));
    expect(refetch).not.toHaveBeenCalled();

    focusAfter(REFOCUS_REFETCH_MIN_MS);
    focusAfter(REFOCUS_REFETCH_MIN_MS);
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("refetches at most once per 30s, counted from mount", () => {
    expect(REFOCUS_REFETCH_MIN_MS).toBe(30_000);
    const refetch = jest.fn();
    renderHook(() => useRefetchOnRefocus(refetch));

    focusAfter(5_000); // quick tab switch right after mount
    expect(refetch).not.toHaveBeenCalled();

    focusAfter(26_000); // 31s since mount
    expect(refetch).toHaveBeenCalledTimes(1);

    focusAfter(10_000); // 10s since the last refetch
    focusAfter(10_000); // 20s
    expect(refetch).toHaveBeenCalledTimes(1);

    focusAfter(10_000); // 30s
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("calls the latest refetch without re-registering the focus effect", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ fn }: { fn: () => void }) => useRefetchOnRefocus(fn), {
      initialProps: { fn: first },
    });
    rerender({ fn: second });
    expect(mockFocusCallbacks).toHaveLength(1);

    focusAfter(REFOCUS_REFETCH_MIN_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("usePullToRefresh", () => {
  it("is not refreshing for a background fetch nobody pulled for", () => {
    const { result } = renderHook(({ busy }: { busy: boolean }) => usePullToRefresh(jest.fn(), busy), {
      initialProps: { busy: true },
    });
    expect(result.current.refreshing).toBe(false);
  });

  it("spins from the pull until the fetch it started finishes", () => {
    const refetch = jest.fn();
    const { result, rerender } = renderHook(({ busy }: { busy: boolean }) => usePullToRefresh(refetch, busy), {
      initialProps: { busy: false },
    });

    act(() => result.current.onRefresh());
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(true);

    rerender({ busy: true });
    expect(result.current.refreshing).toBe(true);

    rerender({ busy: false });
    expect(result.current.refreshing).toBe(false);
  });

  it("gives up after a bound if the fetch never reports busy", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => usePullToRefresh(jest.fn(), false));

    act(() => result.current.onRefresh());
    expect(result.current.refreshing).toBe(true);
    act(() => jest.advanceTimersByTime(10_000));
    expect(result.current.refreshing).toBe(false);
  });
});
