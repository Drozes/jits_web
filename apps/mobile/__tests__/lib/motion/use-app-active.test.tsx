/**
 * useAppActive (Adding Flare, jits-pddd.1): ambient loops run only while
 * the app is in the foreground. True on the first frame when active, false
 * on background or inactive, true again on foreground, and the AppState
 * listener is removed on unmount.
 */
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import { useAppActive, __resetAppActiveForTests } from "@/lib/motion";

let listeners: Array<(s: string) => void> = [];
const mockRemove = jest.fn();

beforeEach(() => {
  listeners = [];
  mockRemove.mockClear();
  __resetAppActiveForTests();
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_t: string, l: (s: string) => void) => {
    listeners.push(l);
    return {
      remove: () => {
        mockRemove();
        listeners = listeners.filter((x) => x !== l);
      },
    };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function setCurrent(state: string | null) {
  Object.defineProperty(AppState, "currentState", { value: state, configurable: true, writable: true });
}

function emit(state: string) {
  act(() => {
    for (const l of [...listeners]) l(state);
  });
}

describe("useAppActive", () => {
  it("is true on the first frame when the app is active", () => {
    setCurrent("active");
    const { result } = renderHook(() => useAppActive());
    expect(result.current).toBe(true);
  });

  it("is false on the first frame when the app is backgrounded", () => {
    setCurrent("background");
    const { result } = renderHook(() => useAppActive());
    expect(result.current).toBe(false);
  });

  it("treats an unknown or missing state as active", () => {
    setCurrent("unknown");
    expect(renderHook(() => useAppActive()).result.current).toBe(true);
    setCurrent(null);
    expect(renderHook(() => useAppActive()).result.current).toBe(true);
  });

  it("follows background, inactive and foreground transitions", () => {
    setCurrent("active");
    const { result } = renderHook(() => useAppActive());
    emit("background");
    expect(result.current).toBe(false);
    emit("active");
    expect(result.current).toBe(true);
    emit("inactive");
    expect(result.current).toBe(false);
    emit("active");
    expect(result.current).toBe(true);
  });

  it("removes its AppState listener on unmount", () => {
    setCurrent("active");
    const { unmount } = renderHook(() => useAppActive());
    expect(listeners).toHaveLength(1);
    unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(0);
  });
});
