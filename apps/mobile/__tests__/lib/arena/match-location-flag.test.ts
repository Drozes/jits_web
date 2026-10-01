/**
 * `match_location_required` on the client (contract-location-flag 1 and 6):
 * read once per foreground through the shared helper, a failed read is OFF
 * but read again on the next foreground, and a server refusal flips it on.
 *
 * Source: apps/mobile/lib/arena/match-location-flag.ts
 */
import { AppState } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockGetFlag = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  getMatchLocationRequired: (...a: unknown[]) => mockGetFlag(...a),
}));

import {
  markMatchLocationRequired,
  readMatchLocationRequired,
  resetMatchLocationRequired,
  useMatchLocationRequired,
} from "@/lib/arena/match-location-flag";

let appStateHandlers: Array<(s: string) => void> = [];

beforeEach(() => {
  jest.clearAllMocks();
  resetMatchLocationRequired();
  appStateHandlers = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, h: (s: string) => void) => {
    appStateHandlers.push(h);
    return { remove: jest.fn() };
  }) as never);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

it("reads the flag on mount", async () => {
  mockGetFlag.mockResolvedValue({ ok: true, data: true });
  const { result } = renderHook(() => useMatchLocationRequired());
  expect(result.current).toBe(false);
  await waitFor(() => expect(result.current).toBe(true));
  expect(mockGetFlag).toHaveBeenCalledTimes(1);
});

it("a failed read is off, and the next foreground reads again", async () => {
  mockGetFlag.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
  const { result } = renderHook(() => useMatchLocationRequired());
  await waitFor(() => expect(mockGetFlag).toHaveBeenCalledTimes(1));
  expect(result.current).toBe(false);
  mockGetFlag.mockResolvedValueOnce({ ok: true, data: true });
  await act(async () => {
    appStateHandlers.forEach((h) => h("active"));
  });
  await waitFor(() => expect(result.current).toBe(true));
});

it("re-reads on every foreground (the owner may flip it while the app is open)", async () => {
  mockGetFlag.mockResolvedValue({ ok: true, data: true });
  const { result } = renderHook(() => useMatchLocationRequired());
  await waitFor(() => expect(result.current).toBe(true));
  mockGetFlag.mockResolvedValue({ ok: true, data: false });
  await act(async () => {
    appStateHandlers.forEach((h) => h("active"));
  });
  await waitFor(() => expect(result.current).toBe(false));
});

it("readMatchLocationRequired loads once, then answers from memory", async () => {
  mockGetFlag.mockResolvedValue({ ok: true, data: true });
  expect(await readMatchLocationRequired()).toBe(true);
  expect(await readMatchLocationRequired()).toBe(true);
  expect(mockGetFlag).toHaveBeenCalledTimes(1);
});

it("a failed imperative read answers off", async () => {
  mockGetFlag.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
  expect(await readMatchLocationRequired()).toBe(false);
});

it("a server refusal marks it on for every reader", async () => {
  mockGetFlag.mockResolvedValue({ ok: true, data: false });
  const { result } = renderHook(() => useMatchLocationRequired());
  await waitFor(() => expect(mockGetFlag).toHaveBeenCalled());
  act(() => markMatchLocationRequired(true));
  expect(result.current).toBe(true);
  expect(await readMatchLocationRequired()).toBe(true);
});
