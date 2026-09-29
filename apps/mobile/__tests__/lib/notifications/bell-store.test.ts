/**
 * The app-wide bell store (jits-dq85.7): host registration, open/close and
 * the badge value.
 */
import { act, renderHook } from "@testing-library/react-native";
import {
  closeBell,
  openBell,
  publishBellBadge,
  registerBellHost,
  resetBellStore,
  useBellBadgeCount,
  useBellOpen,
  useFreshIncomingCount,
} from "@/lib/notifications/bell-store";

beforeEach(() => {
  resetBellStore();
});

function useBoth() {
  return { open: useBellOpen(), badge: useBellBadgeCount() };
}

describe("bell-store", () => {
  it("openBell with no host registered does nothing (no throw, stays closed)", () => {
    const { result } = renderHook(useBoth);
    expect(() => act(() => openBell())).not.toThrow();
    expect(result.current.open).toBe(false);
  });

  it("a host registered after a hostless tap is not opened by it", () => {
    const { result } = renderHook(useBoth);
    act(() => openBell());
    const handler = jest.fn();
    act(() => {
      registerBellHost(handler);
    });
    expect(result.current.open).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("openBell with a host opens the panel and runs the host's re-read", () => {
    const handler = jest.fn();
    registerBellHost(handler);
    const { result } = renderHook(useBoth);
    act(() => openBell());
    expect(result.current.open).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("closeBell is idempotent and does not notify when nothing changes", () => {
    registerBellHost(jest.fn());
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useBellOpen();
    });
    act(() => openBell());
    const afterOpen = renders;
    act(() => closeBell());
    const afterClose = renders;
    expect(afterClose).toBe(afterOpen + 1);
    act(() => closeBell());
    act(() => publishBellBadge(0));
    expect(renders).toBe(afterClose);
  });

  it("a stale host unregistering keeps the newer host's handler, badge and open panel", () => {
    const a = jest.fn();
    const b = jest.fn();
    const unregisterA = registerBellHost(a);
    registerBellHost(b);
    const { result } = renderHook(useBoth);
    act(() => publishBellBadge(3));
    act(() => openBell());
    act(() => unregisterA());
    expect(result.current).toEqual({ open: true, badge: 3 });
    act(() => openBell());
    expect(b).toHaveBeenCalledTimes(2);
    expect(a).not.toHaveBeenCalled();
  });

  it("the current host unregistering clears the badge and closes the panel", () => {
    const unregister = registerBellHost(jest.fn());
    const { result } = renderHook(useBoth);
    act(() => publishBellBadge(2));
    act(() => openBell());
    act(() => unregister());
    expect(result.current).toEqual({ open: false, badge: 0 });
    act(() => openBell());
    expect(result.current.open).toBe(false);
  });

  it("publishBellBadge clamps negatives and non-finite values to 0 and floors fractions", () => {
    const { result } = renderHook(useBoth);
    act(() => publishBellBadge(-4));
    expect(result.current.badge).toBe(0);
    act(() => publishBellBadge(Number.NaN));
    expect(result.current.badge).toBe(0);
    act(() => publishBellBadge(2.7));
    expect(result.current.badge).toBe(2);
  });

  it("publishes the fresh incoming count separately from the badge (highlights excluded)", () => {
    const { result } = renderHook(() => ({
      badge: useBellBadgeCount(),
      fresh: useFreshIncomingCount(),
    }));
    act(() => publishBellBadge(3, 2));
    expect(result.current).toEqual({ badge: 3, fresh: 2 });
    // Omitting it leaves the last value alone.
    act(() => publishBellBadge(5));
    expect(result.current).toEqual({ badge: 5, fresh: 2 });
    act(() => publishBellBadge(0, Number.NaN));
    expect(result.current).toEqual({ badge: 0, fresh: 0 });
  });

  it("the current host unregistering also clears the fresh incoming count the Arena tab reads", () => {
    const unregister = registerBellHost(jest.fn());
    const { result } = renderHook(() => useFreshIncomingCount());
    act(() => publishBellBadge(2, 2));
    expect(result.current).toBe(2);
    act(() => unregister());
    expect(result.current).toBe(0);
  });
});
