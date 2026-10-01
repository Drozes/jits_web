/**
 * The Arena's nearby read (jr_be 016 addendum, contract-arena-nearby 1 and
 * 3): `get_arena_nearby` on focus, every 60 s while focused, on foreground
 * and (debounced) on lobby / live changes; a `browse` reading first only for
 * a non-live viewer with the flag on and permission ALREADY granted (never
 * a prompt), at most once per 30 s. Every non-`nearby` answer, a refused
 * browse reading and any RPC failure fall back to today's list.
 */
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockPermission = jest.fn();
const mockRequest = jest.fn();
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: () => mockPermission(),
  requestForegroundPermissionsAsync: () => mockRequest(),
}));
const mockReading = jest.fn();
jest.mock("@/lib/invites/location", () => ({ readLocationOnce: (...a: unknown[]) => mockReading(...a) }));
const mockNearby = jest.fn();
const mockBrowse = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  getArenaNearby: (...a: unknown[]) => mockNearby(...a),
  reportBrowsePresence: (...a: unknown[]) => mockBrowse(...a),
}));

import {
  ARENA_NEARBY_DEBOUNCE_MS,
  ARENA_NEARBY_REFRESH_MS,
  BROWSE_MIN_INTERVAL_MS,
  __resetArenaNearbyForTests,
  useArenaNearby,
  type UseArenaNearbyInput,
} from "@/lib/arena/use-arena-nearby";

const OK_READING = { status: "ok", reading: { lat: 43.6, lng: -79.4, accuracyM: 12 } };
const NEARBY = {
  ok: true,
  data: { mode: "nearby", onTheMat: ["a-1"], close: [{ athleteId: "a-2", band: "under_1km" }] },
};

let appStateHandlers: ((s: string) => void)[] = [];
function setAppState(s: string) {
  Object.defineProperty(AppState, "currentState", { value: s, configurable: true });
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

const BASE: UseArenaNearbyInput = { focused: true, isLive: false, locationRequired: true, lobbyKey: "a-1,a-2" };
function mount(over: Partial<UseArenaNearbyInput> = {}) {
  return renderHook((p: UseArenaNearbyInput) => useArenaNearby(p), { initialProps: { ...BASE, ...over } });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  __resetArenaNearbyForTests();
  setAppState("active");
  appStateHandlers = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, h: (s: string) => void) => {
    appStateHandlers.push(h);
    return {
      remove: () => {
        appStateHandlers = appStateHandlers.filter((x) => x !== h);
      },
    };
  }) as never);
  jest.spyOn(console, "warn").mockImplementation(() => {});
  mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
  mockReading.mockResolvedValue(OK_READING);
  mockBrowse.mockResolvedValue({ ok: true, data: { ok: true, verdict: "recorded", started: false, match_id: null } });
  mockNearby.mockResolvedValue(NEARBY);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useArenaNearby: modes", () => {
  it("nearby mode: on-the-mat ids and banded close ids", async () => {
    const { result } = mount();
    await flush();
    expect(result.current.mode).toBe("nearby");
    if (result.current.mode !== "nearby") throw new Error("mode");
    expect([...result.current.onTheMat]).toEqual(["a-1"]);
    expect(result.current.close.get("a-2")).toBe("under_1km");
  });

  it.each(["flag_off", "no_location"])("%s falls back to today's list", async (mode) => {
    mockNearby.mockResolvedValue({ ok: true, data: { mode, onTheMat: [], close: [] } });
    const { result } = mount();
    await flush();
    expect(result.current).toEqual({ mode: "fallback" });
  });

  it("an RPC failure falls back", async () => {
    mockNearby.mockResolvedValue({ ok: false, error: { hint: "rpc_missing", message: "" } });
    const { result } = mount();
    await flush();
    expect(result.current).toEqual({ mode: "fallback" });
  });

  it("a nearby result that later fails returns to today's list", async () => {
    const { result } = mount();
    await flush();
    expect(result.current.mode).toBe("nearby");
    mockNearby.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "" } });
    await advance(ARENA_NEARBY_REFRESH_MS);
    expect(result.current.mode).toBe("fallback");
  });
});

describe("useArenaNearby: browse reading", () => {
  it("non-live, flag on, permission granted: one browse reading before the read, never a prompt", async () => {
    const order: string[] = [];
    mockBrowse.mockImplementation(async () => {
      order.push("browse");
      return { ok: true, data: { ok: true, verdict: "recorded", started: false, match_id: null } };
    });
    mockNearby.mockImplementation(async () => {
      order.push("nearby");
      return NEARBY;
    });
    mount();
    await flush();
    expect(order).toEqual(["browse", "nearby"]);
    expect(mockReading).toHaveBeenCalledWith({ ask: false });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("permission not granted: no reading, no prompt, still reads (server says no_location)", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    mockNearby.mockResolvedValue({ ok: true, data: { mode: "no_location", onTheMat: [], close: [] } });
    const { result } = mount();
    await flush();
    expect(mockReading).not.toHaveBeenCalled();
    expect(mockBrowse).not.toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockNearby).toHaveBeenCalledTimes(1);
    expect(result.current.mode).toBe("fallback");
  });

  it("live: no browse reading (the go_live reading covers it)", async () => {
    mount({ isLive: true });
    await flush();
    expect(mockBrowse).not.toHaveBeenCalled();
    expect(mockNearby).toHaveBeenCalledTimes(1);
  });

  it("flag off: no browse reading", async () => {
    mount({ locationRequired: false });
    await flush();
    expect(mockBrowse).not.toHaveBeenCalled();
    expect(mockPermission).not.toHaveBeenCalled();
  });

  it("a refused browse reading (implausible speed) is handled as no location", async () => {
    mockBrowse.mockResolvedValue({ ok: true, data: { ok: false, code: "implausible_movement" } });
    mockNearby.mockResolvedValue({ ok: true, data: { mode: "no_location", onTheMat: [], close: [] } });
    const { result } = mount();
    await flush();
    expect(result.current).toEqual({ mode: "fallback" });
  });

  it("browse at most once per 30 s, refreshed with the 60 s read", async () => {
    const r = mount();
    await flush();
    expect(mockBrowse).toHaveBeenCalledTimes(1);
    // A lobby change 2 s later reads again but sends no second reading.
    r.rerender({ ...BASE, lobbyKey: "a-1" });
    await advance(ARENA_NEARBY_DEBOUNCE_MS);
    expect(mockNearby).toHaveBeenCalledTimes(2);
    expect(mockBrowse).toHaveBeenCalledTimes(1);
    await advance(ARENA_NEARBY_REFRESH_MS);
    expect(BROWSE_MIN_INTERVAL_MS).toBeLessThan(ARENA_NEARBY_REFRESH_MS);
    expect(mockBrowse).toHaveBeenCalledTimes(2);
  });
});

describe("useArenaNearby: when it reads", () => {
  it("re-reads every 60 s while focused and stops when unfocused", async () => {
    const r = mount();
    await flush();
    expect(mockNearby).toHaveBeenCalledTimes(1);
    await advance(ARENA_NEARBY_REFRESH_MS);
    expect(mockNearby).toHaveBeenCalledTimes(2);
    r.rerender({ ...BASE, focused: false });
    await advance(ARENA_NEARBY_REFRESH_MS * 3);
    expect(mockNearby).toHaveBeenCalledTimes(2);
    // Focus again: reads at once, then resumes the 60 s cadence.
    r.rerender({ ...BASE, focused: true });
    await flush();
    expect(mockNearby).toHaveBeenCalledTimes(3);
  });

  it("never reads while unfocused", async () => {
    mount({ focused: false });
    await advance(ARENA_NEARBY_REFRESH_MS * 2);
    expect(mockNearby).not.toHaveBeenCalled();
  });

  it("debounces lobby and live changes into one read", async () => {
    const r = mount();
    await flush();
    r.rerender({ ...BASE, lobbyKey: "a-1" });
    r.rerender({ ...BASE, lobbyKey: "a-1,a-3" });
    r.rerender({ ...BASE, lobbyKey: "a-1,a-3", isLive: true });
    await advance(ARENA_NEARBY_DEBOUNCE_MS - 1);
    expect(mockNearby).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(mockNearby).toHaveBeenCalledTimes(2);
  });

  it("skips the 60 s read in the background and reads on foreground", async () => {
    mount();
    await flush();
    setAppState("background");
    await advance(ARENA_NEARBY_REFRESH_MS);
    expect(mockNearby).toHaveBeenCalledTimes(1);
    setAppState("active");
    await act(async () => {
      for (const h of appStateHandlers) h("active");
    });
    await flush();
    expect(mockNearby).toHaveBeenCalledTimes(2);
  });
});
