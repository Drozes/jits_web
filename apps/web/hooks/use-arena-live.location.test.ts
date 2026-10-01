import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useArenaLive, type LiveLocationFlag } from "./use-arena-live";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
const mutations = vi.hoisted(() => ({ toggleMatchPreferences: vi.fn() }));
vi.mock("@jits/shared/api/mutations", () => mutations);
const lobby = vi.hoisted(() => ({ joinLobby: vi.fn(), leaveLobby: vi.fn() }));
vi.mock("@/hooks/use-lobby-presence", () => lobby);
const loc = vi.hoisted(() => ({
  captureAndReport: vi.fn(),
  locationPermission: vi.fn(),
}));
vi.mock("@/lib/location/match-location", async (orig) => ({
  ...(await orig<typeof import("@/lib/location/match-location")>()),
  ...loc,
}));

let visibility: DocumentVisibilityState = "visible";
function setVisibility(v: DocumentVisibilityState) {
  visibility = v;
  document.dispatchEvent(new Event("visibilitychange"));
}

function flag(required: boolean): LiveLocationFlag {
  return {
    required,
    ensure: vi.fn(async () => required),
    markRequired: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  mutations.toggleMatchPreferences.mockResolvedValue({ ok: true, data: null });
  loc.captureAndReport.mockResolvedValue({ ok: true });
  loc.locationPermission.mockResolvedValue("granted");
});

afterEach(() => {
  vi.useRealTimers();
});

function mount(location: LiveLocationFlag, initialLive = false, inMatch = false) {
  return renderHook(
    ({ inMatch }: { inMatch: boolean }) =>
      useArenaLive({ athleteId: "me", initialLive, inMatch, location }),
    { initialProps: { inMatch } },
  );
}

describe("useArenaLive with match_location_required", () => {
  it("flag off: goes live with no location step at all", async () => {
    const { result } = mount(flag(false));
    await act(() => result.current.goLive());
    expect(result.current.isLive).toBe(true);
    expect(loc.captureAndReport).not.toHaveBeenCalled();
    expect(loc.locationPermission).not.toHaveBeenCalled();
    expect(result.current.locationPrompt).toBeNull();
  });

  it("flag on, permission not yet granted: shows the explain step and writes nothing", async () => {
    loc.locationPermission.mockResolvedValue("prompt");
    const { result } = mount(flag(true));
    await act(() => result.current.toggle());
    expect(result.current.locationPrompt).toBe("explain");
    expect(result.current.isLive).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(loc.captureAndReport).not.toHaveBeenCalled();
    expect(mutations.toggleMatchPreferences).not.toHaveBeenCalled();
  });

  it("explain then Allow location: reports go_live, then flips live", async () => {
    loc.locationPermission.mockResolvedValue("prompt");
    const order: string[] = [];
    loc.captureAndReport.mockImplementation(async (_c, context) => {
      order.push(`report:${context}`);
      return { ok: true };
    });
    mutations.toggleMatchPreferences.mockImplementation(async () => {
      order.push("write");
      return { ok: true, data: null };
    });
    const { result } = mount(flag(true));
    await act(() => result.current.toggle());
    await act(() => result.current.confirmLocation());
    expect(order).toEqual(["report:go_live", "write"]);
    expect(result.current.isLive).toBe(true);
    expect(result.current.locationPrompt).toBeNull();
  });

  it("explain step can be dismissed", async () => {
    loc.locationPermission.mockResolvedValue("unknown");
    const { result } = mount(flag(true));
    await act(() => result.current.toggle());
    act(() => result.current.dismissLocation());
    expect(result.current.locationPrompt).toBeNull();
  });

  it("permission already granted: skips explain and goes straight to the reading", async () => {
    const { result } = mount(flag(true));
    await act(() => result.current.goLive());
    expect(loc.captureAndReport).toHaveBeenCalledWith({}, "go_live");
    expect(result.current.isLive).toBe(true);
  });

  it("denied (or no geolocation): shows the denied state and stays offline", async () => {
    loc.captureAndReport.mockResolvedValue({ ok: false, failure: "denied" });
    const { result } = mount(flag(true));
    await act(() => result.current.goLive());
    expect(result.current.locationPrompt).toBe("denied");
    expect(result.current.isLive).toBe(false);
    expect(mutations.toggleMatchPreferences).not.toHaveBeenCalled();
    expect(lobby.joinLobby).not.toHaveBeenCalled();
  });

  it("timeout / too coarse: shows the accuracy state; Retry recovers", async () => {
    loc.captureAndReport.mockResolvedValueOnce({ ok: false, failure: "accuracy" });
    const { result } = mount(flag(true));
    await act(() => result.current.goLive());
    expect(result.current.locationPrompt).toBe("accuracy");
    await act(() => result.current.confirmLocation());
    expect(result.current.isLive).toBe(true);
    expect(result.current.locationPrompt).toBeNull();
  });

  it("implausible movement: shows the try-again state, stays offline, never retries on its own", async () => {
    loc.captureAndReport.mockResolvedValueOnce({ ok: false, failure: "implausible" });
    const { result } = mount(flag(true));
    await act(() => result.current.goLive());
    expect(result.current.locationPrompt).toBe("implausible");
    expect(result.current.isLive).toBe(false);
    expect(mutations.toggleMatchPreferences).not.toHaveBeenCalled();
    expect(loc.captureAndReport).toHaveBeenCalledTimes(1);
    await act(async () => {});
    expect(loc.captureAndReport).toHaveBeenCalledTimes(1);
    // Try again is the athlete's call.
    await act(() => result.current.confirmLocation());
    expect(result.current.isLive).toBe(true);
    expect(result.current.locationPrompt).toBeNull();
  });

  it("a report that did not land still lets the server decide", async () => {
    loc.captureAndReport.mockResolvedValue({
      ok: false,
      failure: null,
      report: { ok: false, code: "error", hint: null },
    });
    const { result } = mount(flag(true));
    await act(() => result.current.goLive());
    expect(mutations.toggleMatchPreferences).toHaveBeenCalled();
    expect(result.current.isLive).toBe(true);
  });

  it("server HINT location_required: rolls back to the denied state, no generic toast", async () => {
    const location = flag(false);
    mutations.toggleMatchPreferences.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "x", raw: { hint: "location_required" } },
    });
    const { result } = mount(location);
    await act(() => result.current.goLive());
    expect(result.current.isLive).toBe(false);
    expect(result.current.locationPrompt).toBe("denied");
    expect(location.markRequired).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(lobby.leaveLobby).toHaveBeenCalled();
  });

  it("waits for a flag read still in flight before deciding", async () => {
    let resolve!: (v: boolean) => void;
    const location: LiveLocationFlag = {
      required: false,
      ensure: () => new Promise<boolean>((r) => (resolve = r)),
      markRequired: vi.fn(),
    };
    const { result } = mount(location);
    let done!: Promise<void>;
    act(() => {
      done = result.current.goLive();
    });
    expect(mutations.toggleMatchPreferences).not.toHaveBeenCalled();
    await act(async () => {
      resolve(true);
      await done;
    });
    expect(loc.captureAndReport).toHaveBeenCalledWith({}, "go_live");
  });

  it("going offline clears a stale prompt and never asks for location", async () => {
    loc.captureAndReport.mockResolvedValueOnce({ ok: false, failure: "denied" });
    const { result } = mount(flag(true));
    await act(() => result.current.goLive());
    await act(() => result.current.confirmLocation()); // live now
    loc.captureAndReport.mockClear();
    await act(() => result.current.goOffline());
    expect(result.current.isLive).toBe(false);
    expect(loc.captureAndReport).not.toHaveBeenCalled();
  });

  it("match restore never shows explain; a failed reading leaves them offline with a toast", async () => {
    const { result, rerender } = mount(flag(true), true);
    rerender({ inMatch: true });
    await act(async () => {});
    expect(result.current.isLive).toBe(false);
    loc.locationPermission.mockResolvedValue("prompt");
    loc.captureAndReport.mockResolvedValue({ ok: false, failure: "denied" });
    rerender({ inMatch: false });
    await act(async () => {});
    expect(result.current.isLive).toBe(false);
    expect(result.current.locationPrompt).toBe("denied");
    expect(toastError).toHaveBeenCalledWith("You're offline. Go live again in the Arena.");
  });
});

describe("go_live refresh while live", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  const captures = () =>
    loc.captureAndReport.mock.calls.filter((c) => c[1] === "go_live").length;

  it("refreshes at once when live with no recent reading, then every 60 s", async () => {
    mount(flag(true), true);
    await act(async () => {});
    expect(captures()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(captures()).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(captures()).toBe(3);
  });

  it("does not double up right after a go-live reading", async () => {
    const { result } = mount(flag(true));
    await act(() => result.current.goLive());
    expect(captures()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(captures()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(captures()).toBe(2);
  });

  it("stops while the tab is hidden and resumes when visible", async () => {
    mount(flag(true), true);
    await act(async () => {});
    expect(captures()).toBe(1);
    act(() => setVisibility("hidden"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(captures()).toBe(1);
    act(() => setVisibility("visible"));
    await act(async () => {});
    expect(captures()).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(captures()).toBe(3);
  });

  it("stops when the athlete goes offline", async () => {
    const { result } = mount(flag(true), true);
    await act(async () => {});
    await act(() => result.current.goOffline());
    const before = captures();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(captures()).toBe(before);
  });

  it("never runs with the flag off, while offline, or in a match", async () => {
    mount(flag(false), true);
    mount(flag(true), false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(captures()).toBe(0);
  });

  it("never raises a browser prompt in the background", async () => {
    loc.locationPermission.mockResolvedValue("prompt");
    mount(flag(true), true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(captures()).toBe(0);
  });
});
