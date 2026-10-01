import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMatchLocationRequired } from "./use-match-location-required";

const flag = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("./match-location", () => ({ readMatchLocationRequired: flag.read }));

let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.clearAllMocks();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

describe("useMatchLocationRequired", () => {
  it("reads once on mount and exposes the value", async () => {
    flag.read.mockResolvedValue(true);
    const { result } = renderHook(() => useMatchLocationRequired());
    await act(async () => {});
    expect(flag.read).toHaveBeenCalledTimes(1);
    expect(result.current.required).toBe(true);
    expect(await result.current.ensure()).toBe(true);
  });

  it("ensure() waits for a read still in flight", async () => {
    let resolve!: (v: boolean) => void;
    flag.read.mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
    const { result } = renderHook(() => useMatchLocationRequired());
    let value: boolean | undefined;
    const p = result.current.ensure().then((v) => (value = v));
    expect(value).toBeUndefined();
    await act(async () => {
      resolve(true);
      await p;
    });
    expect(value).toBe(true);
  });

  it("re-reads when the tab comes back, not when it hides", async () => {
    flag.read.mockResolvedValue(false);
    const { result } = renderHook(() => useMatchLocationRequired());
    await act(async () => {});
    visibility = "hidden";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(flag.read).toHaveBeenCalledTimes(1);
    flag.read.mockResolvedValue(true);
    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(flag.read).toHaveBeenCalledTimes(2);
    expect(result.current.required).toBe(true);
  });

  it("markRequired flips it on after a server HINT", async () => {
    flag.read.mockResolvedValue(false);
    const { result } = renderHook(() => useMatchLocationRequired());
    await act(async () => {});
    act(() => result.current.markRequired());
    expect(result.current.required).toBe(true);
    expect(await result.current.ensure()).toBe(true);
  });
});
