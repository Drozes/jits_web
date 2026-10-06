/**
 * `invites_enabled` on the device: a failed read is not cached (the next
 * mount retries), a successful one is, and sign-out forgets it.
 *
 * Source: apps/mobile/lib/invites/use-invites-enabled.ts
 */
import { renderHook, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockRead = jest.fn();
jest.mock("@jits/shared/api/invites", () => ({ readInvitesEnabled: (...a: unknown[]) => mockRead(...a) }));

import { resetInvitesEnabledCache, useInvitesEnabled, useInvitesFlagState } from "@/lib/invites/use-invites-enabled";

beforeEach(() => {
  jest.clearAllMocks();
  resetInvitesEnabledCache();
});

it("a failed first read is retried on the next mount, then the entry points show", async () => {
  mockRead.mockResolvedValueOnce(null);
  const first = renderHook(() => useInvitesEnabled());
  await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(1));
  expect(first.result.current).toBe(false);
  first.unmount();

  mockRead.mockResolvedValueOnce(true);
  const second = renderHook(() => useInvitesEnabled());
  await waitFor(() => expect(second.result.current).toBe(true));
  expect(mockRead).toHaveBeenCalledTimes(2);
});

it("a successful read is cached until sign-out resets it", async () => {
  mockRead.mockResolvedValue(true);
  const a = renderHook(() => useInvitesEnabled());
  await waitFor(() => expect(a.result.current).toBe(true));
  const b = renderHook(() => useInvitesEnabled());
  expect(b.result.current).toBe(true);
  expect(mockRead).toHaveBeenCalledTimes(1);

  resetInvitesEnabledCache();
  mockRead.mockResolvedValue(false);
  const c = renderHook(() => useInvitesEnabled());
  await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(c.result.current).toBe(false));
});

describe("useInvitesFlagState (specs/matches-tab 10.2)", () => {
  it("is unknown until a read succeeds, never off by default", async () => {
    let resolve: (v: boolean | null) => void = () => undefined;
    mockRead.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const h = renderHook(() => useInvitesFlagState());
    expect(h.result.current).toEqual({ enabled: false, known: false, state: "unknown" });
    resolve(true);
    await waitFor(() => expect(h.result.current).toEqual({ enabled: true, known: true, state: "on" }));
  });

  it("a failed read stays unknown (not off); a later read can still land", async () => {
    mockRead.mockResolvedValueOnce(null);
    const h = renderHook(() => useInvitesFlagState());
    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(1));
    expect(h.result.current.known).toBe(false);
    h.unmount();
    mockRead.mockResolvedValueOnce(false);
    const again = renderHook(() => useInvitesFlagState());
    await waitFor(() => expect(again.result.current).toEqual({ enabled: false, known: true, state: "off" }));
  });

  it("shares the cache with useInvitesEnabled (one read)", async () => {
    mockRead.mockResolvedValue(true);
    const a = renderHook(() => useInvitesEnabled());
    await waitFor(() => expect(a.result.current).toBe(true));
    const b = renderHook(() => useInvitesFlagState());
    expect(b.result.current.state).toBe("on");
    expect(mockRead).toHaveBeenCalledTimes(1);
  });
});
