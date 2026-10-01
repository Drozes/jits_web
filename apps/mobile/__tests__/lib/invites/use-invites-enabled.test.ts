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

import { resetInvitesEnabledCache, useInvitesEnabled } from "@/lib/invites/use-invites-enabled";

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
