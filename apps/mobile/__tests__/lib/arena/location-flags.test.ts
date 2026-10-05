/**
 * `match_proximity_required` and `live_location_drift_check` (instant
 * go-live 4.3, 4.4): the same semantics as `match_location_required`.
 * A read on mount and per foreground; a failed read counts as OFF and is not
 * remembered; a server signal flips it at once; sign-out forgets it.
 *
 * Source: apps/mobile/lib/arena/location-flags.ts
 */
import { AppState } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockProximity = jest.fn();
const mockDrift = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  getMatchProximityRequired: () => mockProximity(),
  getLiveLocationDriftCheck: () => mockDrift(),
}));

import {
  liveDriftCheckFlag,
  markMatchProximityRequired,
  matchProximityFlag,
  resetLocationFlags,
  useMatchProximityRequired,
} from "@/lib/arena/location-flags";

let handlers: ((s: string) => void)[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  resetLocationFlags();
  handlers = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, h: (s: string) => void) => {
    handlers.push(h);
    return { remove: jest.fn() };
  }) as never);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

it("reads on mount; a missing row (older backend) is off", async () => {
  mockProximity.mockResolvedValue({ ok: true, data: false });
  const { result } = renderHook(() => useMatchProximityRequired());
  await waitFor(() => expect(mockProximity).toHaveBeenCalledTimes(1));
  expect(result.current).toBe(false);
});

it("on: re-read on every return to the foreground", async () => {
  mockProximity.mockResolvedValue({ ok: true, data: true });
  const { result } = renderHook(() => useMatchProximityRequired());
  await waitFor(() => expect(result.current).toBe(true));
  mockProximity.mockResolvedValue({ ok: true, data: false });
  await act(async () => {
    for (const h of handlers) h("active");
  });
  await waitFor(() => expect(result.current).toBe(false));
});

it("a failed read is OFF and not remembered: the next read asks again", async () => {
  mockProximity.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
  expect(await matchProximityFlag.read()).toBe(false);
  mockProximity.mockResolvedValueOnce({ ok: true, data: true });
  expect(await matchProximityFlag.read()).toBe(true);
  expect(mockProximity).toHaveBeenCalledTimes(2);
});

it("a server proximity refusal marks it on at once, beating a read in flight", async () => {
  let resolve!: (v: unknown) => void;
  mockProximity.mockReturnValue(new Promise((r) => (resolve = r)));
  const { result } = renderHook(() => useMatchProximityRequired());
  act(() => markMatchProximityRequired(true));
  expect(result.current).toBe(true);
  await act(async () => {
    resolve({ ok: true, data: false });
  });
  expect(result.current).toBe(true);
});

it("the drift flag is its own store, and sign-out forgets both", async () => {
  mockDrift.mockResolvedValue({ ok: true, data: true });
  expect(await liveDriftCheckFlag.read()).toBe(true);
  markMatchProximityRequired(true);
  resetLocationFlags();
  expect(matchProximityFlag.peek()).toBe(false);
  expect(liveDriftCheckFlag.peek()).toBe(false);
});
