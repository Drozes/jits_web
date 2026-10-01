/**
 * Friend ids for the Arena: friendships have no realtime stream (jr_be A3),
 * so the hook re-reads on focus, on foreground and on notifyFriendsChanged,
 * and a failed read keeps the last known set.
 *
 * Source: apps/mobile/lib/invites/use-friend-ids.ts
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("expo-router", () => {
  const R = jest.requireActual<typeof import("react")>("react");
  return { useFocusEffect: (cb: () => void) => R.useEffect(cb, [cb]) };
});
const mockGetMyFriends = jest.fn();
jest.mock("@jits/shared/api/friends", () => ({
  getMyFriends: (...a: unknown[]) => mockGetMyFriends(...a),
}));

import { notifyFriendsChanged, useFriendIds } from "@/lib/invites/use-friend-ids";

const friends = (...ids: string[]) => ({ ok: true, data: ids.map((athlete_id) => ({ athlete_id })) });

let appStateHandler: ((s: string) => void) | null = null;
beforeEach(() => {
  jest.clearAllMocks();
  appStateHandler = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_t, h) => {
    appStateHandler = h as (s: string) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

it("reads on mount and does not read without an athlete", async () => {
  mockGetMyFriends.mockResolvedValue(friends("a"));
  const none = renderHook(() => useFriendIds(null));
  expect(mockGetMyFriends).not.toHaveBeenCalled();
  none.unmount();

  const { result } = renderHook(() => useFriendIds("me"));
  await waitFor(() => expect(result.current.has("a")).toBe(true));
});

it("re-reads on notifyFriendsChanged and when the app returns to the foreground", async () => {
  mockGetMyFriends.mockResolvedValueOnce(friends("a"));
  const { result } = renderHook(() => useFriendIds("me"));
  await waitFor(() => expect(result.current.has("a")).toBe(true));

  mockGetMyFriends.mockResolvedValueOnce(friends("a", "b"));
  act(() => notifyFriendsChanged());
  await waitFor(() => expect(result.current.has("b")).toBe(true));

  mockGetMyFriends.mockResolvedValueOnce(friends("b"));
  act(() => appStateHandler?.("active"));
  await waitFor(() => expect(result.current.has("a")).toBe(false));
  expect(result.current.has("b")).toBe(true);
});

it("keeps the last known set when a read fails", async () => {
  mockGetMyFriends.mockResolvedValueOnce(friends("a"));
  const { result } = renderHook(() => useFriendIds("me"));
  await waitFor(() => expect(result.current.has("a")).toBe(true));

  mockGetMyFriends.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
  act(() => notifyFriendsChanged());
  await waitFor(() => expect(mockGetMyFriends).toHaveBeenCalledTimes(2));
  expect(result.current.has("a")).toBe(true);
});

