/**
 * `timekeeper_role` for the Arena copy (timekeeper mode spec 4.2 Arena and
 * 11, 14.8 M6): fail-closed and tri-state, read on mount and on every return
 * to the foreground, keeping the last good value through a failed re-read.
 */
import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
const mockGetFlag = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  getFeatureFlag: (...a: unknown[]) => mockGetFlag(...a),
}));

import {
  TIMEKEEPER_ROLE_FLAG,
  __resetTimekeeperEnabledForTests,
  useTimekeeperEnabled,
} from "@/lib/match-flow/use-timekeeper-enabled";

let appStateHandlers: ((s: AppStateStatus) => void)[] = [];

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

function foreground() {
  act(() => {
    for (const h of [...appStateHandlers]) h("active");
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetTimekeeperEnabledForTests();
  appStateHandlers = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_e: string, handler: unknown) => {
    const h = handler as (s: AppStateStatus) => void;
    appStateHandlers.push(h);
    return { remove: () => (appStateHandlers = appStateHandlers.filter((x) => x !== h)) } as never;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useTimekeeperEnabled", () => {
  it("reads timekeeper_role with the app client", async () => {
    mockGetFlag.mockResolvedValue({ ok: true, data: true });
    renderHook(() => useTimekeeperEnabled());
    await flush();
    expect(mockGetFlag).toHaveBeenCalledWith({ tag: "client" }, "timekeeper_role");
    expect(TIMEKEEPER_ROLE_FLAG).toBe("timekeeper_role");
  });

  it("is unknown (and so not enabled) until a read succeeds", async () => {
    mockGetFlag.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useTimekeeperEnabled());
    expect(result.current).toEqual({ enabled: false, known: false });
    await flush();
    expect(result.current).toEqual({ enabled: false, known: false });
  });

  it("known ON and known OFF (a missing row reads off on the server side of the wrapper)", async () => {
    mockGetFlag.mockResolvedValue({ ok: true, data: true });
    const on = renderHook(() => useTimekeeperEnabled());
    await flush();
    expect(on.result.current).toEqual({ enabled: true, known: true });
    on.unmount();

    __resetTimekeeperEnabledForTests();
    mockGetFlag.mockResolvedValue({ ok: true, data: false });
    const off = renderHook(() => useTimekeeperEnabled());
    await flush();
    expect(off.result.current).toEqual({ enabled: false, known: true });
  });

  it("a failed read stays unknown, and a throwing reader breaks nothing", async () => {
    mockGetFlag.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const failed = renderHook(() => useTimekeeperEnabled());
    await flush();
    expect(failed.result.current).toEqual({ enabled: false, known: false });
    failed.unmount();

    mockGetFlag.mockImplementation(() => {
      throw new Error("not a function");
    });
    const threw = renderHook(() => useTimekeeperEnabled());
    await flush();
    expect(threw.result.current).toEqual({ enabled: false, known: false });
  });

  it("follows the live flag: re-read on every foreground; a failed re-read keeps the last good value", async () => {
    mockGetFlag.mockResolvedValue({ ok: true, data: false });
    const { result } = renderHook(() => useTimekeeperEnabled());
    await flush();
    expect(result.current).toEqual({ enabled: false, known: true });

    mockGetFlag.mockResolvedValue({ ok: true, data: true });
    foreground();
    await flush();
    expect(result.current).toEqual({ enabled: true, known: true });

    mockGetFlag.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    foreground();
    await flush();
    expect(result.current).toEqual({ enabled: true, known: true });
  });

  it("a second reader starts from the cached value, and every mount reads again", async () => {
    mockGetFlag.mockResolvedValue({ ok: true, data: true });
    const first = renderHook(() => useTimekeeperEnabled());
    await flush();
    expect(first.result.current.enabled).toBe(true);
    mockGetFlag.mockReturnValue(new Promise(() => undefined));
    const second = renderHook(() => useTimekeeperEnabled());
    expect(second.result.current).toEqual({ enabled: true, known: true });
    await flush();
    expect(mockGetFlag).toHaveBeenCalledTimes(2);
    expect(second.result.current).toEqual({ enabled: true, known: true });
  });
});
