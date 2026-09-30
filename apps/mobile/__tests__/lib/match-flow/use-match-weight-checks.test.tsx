/**
 * useMatchWeightChecks: the face-off weight-check state (jr_be-ahn.4). Reads
 * get_match_weight_checks when enabled, re-reads on a match_weight_checks
 * postgres_change for this match and on foreground, keeps the last good
 * state across a failed re-read, and falls back to "unavailable" when the
 * match has no checks.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";

let mockRowHandler: (() => void) | null = null;
interface MockChannel {
  on: jest.Mock;
  subscribe: jest.Mock;
}
const mockChannel: MockChannel = {
  on: jest.fn((_e: string, _f: unknown, cb: () => void): MockChannel => {
    mockRowHandler = cb;
    return mockChannel;
  }),
  subscribe: jest.fn((): MockChannel => mockChannel),
};
const mockRemove = jest.fn();
jest.mock("@/lib/supabase/client", () => ({
  supabase: { channel: (...a: unknown[]) => mockChannelFactory(...a), removeChannel: (...a: unknown[]) => mockRemove(...a) },
}));
const mockChannelFactory = jest.fn((..._a: unknown[]) => mockChannel);
const mockGet = jest.fn();
jest.mock("@jits/shared/api/match-weight-checks", () => ({
  getMatchWeightChecks: (...a: unknown[]) => mockGet(...a),
}));

import { useMatchWeightChecks } from "@/lib/match-flow/use-match-weight-checks";

const STATE = (blocked: boolean) => ({
  matchId: "M1",
  required: false,
  blocked,
  canStart: !blocked,
  weights: { a: 170, b: 168 },
  checks: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRowHandler = null;
});

it("idle while disabled: no read, no channel", () => {
  const { result } = renderHook(() => useMatchWeightChecks("M1", false));
  expect(result.current.status).toBe("idle");
  expect(mockGet).not.toHaveBeenCalled();
  expect(mockChannelFactory).not.toHaveBeenCalled();
});

it("reads on enable, subscribes to this match's rows, and re-reads on a change", async () => {
  mockGet.mockResolvedValueOnce({ ok: true, data: STATE(false) });
  const { result, unmount } = renderHook(() => useMatchWeightChecks("M1", true));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.state?.blocked).toBe(false);
  expect(mockChannel.on).toHaveBeenCalledWith(
    "postgres_changes",
    { event: "*", schema: "public", table: "match_weight_checks", filter: "match_id=eq.M1" },
    expect.any(Function),
  );
  mockGet.mockResolvedValueOnce({ ok: true, data: STATE(true) });
  act(() => mockRowHandler?.());
  await waitFor(() => expect(result.current.state?.blocked).toBe(true));
  unmount();
  expect(mockRemove).toHaveBeenCalledWith(mockChannel);
});

it("re-reads on foreground", async () => {
  const listeners: ((s: string) => void)[] = [];
  const spy = jest.spyOn(AppState, "addEventListener").mockImplementation(((_t: string, cb: (s: string) => void) => {
    listeners.push(cb);
    return { remove: jest.fn() };
  }) as never);
  mockGet.mockResolvedValue({ ok: true, data: STATE(false) });
  renderHook(() => useMatchWeightChecks("M1", true));
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
  act(() => listeners.forEach((l) => l("active")));
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  spy.mockRestore();
});

it("no checks for the match (e.g. no_challenge): unavailable", async () => {
  mockGet.mockResolvedValue({ ok: false, error: { code: "NO_CHALLENGE", message: "x" } });
  const { result } = renderHook(() => useMatchWeightChecks("M1", true));
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
});

it("a failed re-read keeps the last good state", async () => {
  mockGet.mockResolvedValueOnce({ ok: true, data: STATE(true) });
  const { result } = renderHook(() => useMatchWeightChecks("M1", true));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  mockGet.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
  act(() => result.current.refetch());
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(result.current.status).toBe("ready");
  expect(result.current.state?.blocked).toBe(true);
});

it("apply() takes an RPC payload and outranks a read still in flight", async () => {
  mockGet.mockResolvedValueOnce({ ok: true, data: STATE(false) });
  const { result } = renderHook(() => useMatchWeightChecks("M1", true));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  let resolve: (v: unknown) => void = () => undefined;
  mockGet.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  act(() => result.current.refetch());
  act(() => result.current.apply(STATE(true)));
  await act(async () => {
    resolve({ ok: true, data: STATE(false) });
    await Promise.resolve();
  });
  expect(result.current.state?.blocked).toBe(true);
});
