/**
 * The Arena tab badge reads the app-wide stores (jits-dq85.16): the incoming
 * count and the live bit from the Arena store, and the result to confirm for
 * the SIGNED-IN athlete from the active-match store.
 */
import { renderHook } from "@testing-library/react-native";

let mockAthlete: { id: string } | null = { id: "me-1" };
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: mockAthlete }),
}));

let mockState = { incomingCount: 0, isLive: false };
jest.mock("@/lib/arena/arena-store", () => ({
  useArenaIncomingCount: () => mockState.incomingCount,
  useIsArenaLive: () => mockState.isLive,
}));

let mockFreshIncoming = 0;
let mockBellLoaded = true;
jest.mock("@/lib/notifications/bell-store", () => ({
  useFreshIncomingCount: () => mockFreshIncoming,
  useBellLoaded: () => mockBellLoaded,
}));

const mockUseMatchToConfirm = jest.fn();
jest.mock("@/lib/match-flow/active-match-store", () => ({
  useMatchToConfirm: (id: string | null) => mockUseMatchToConfirm(id),
}));

import { useArenaTabBadge, useArenaTabState } from "@/lib/arena/use-arena-tab-badge";

beforeEach(() => {
  mockAthlete = { id: "me-1" };
  mockState = { incomingCount: 0, isLive: false };
  mockFreshIncoming = 0;
  mockUseMatchToConfirm.mockReset().mockReturnValue(null);
});

it("shows nothing offline and idle", () => {
  const { result } = renderHook(() => useArenaTabBadge());
  expect(result.current).toBeNull();
  expect(mockUseMatchToConfirm).toHaveBeenCalledWith("me-1");
});

it("counts fresh incoming challenges in red", () => {
  mockState = { incomingCount: 2, isLive: true };
  const { result } = renderHook(() => useArenaTabBadge());
  expect(result.current).toEqual({ kind: "count", count: 2, label: "2 challenges", inIcon: true });
});

it("keeps the green dot live with a result to confirm, a ring offline", () => {
  mockUseMatchToConfirm.mockReturnValue({ matchId: "m-1", status: "in_progress", opponentName: null });
  mockState = { incomingCount: 0, isLive: true };
  const live = renderHook(() => useArenaTabBadge());
  expect(live.result.current?.kind).toBe("dot");

  mockState = { incomingCount: 0, isLive: false };
  const offline = renderHook(() => useArenaTabBadge());
  expect(offline.result.current?.kind).toBe("ring");
});

it("reads no one's result while signed out", () => {
  mockAthlete = null;
  renderHook(() => useArenaTabBadge());
  expect(mockUseMatchToConfirm).toHaveBeenCalledWith(null);
});

it("offline with two fresh incoming challenges shows a red 2, agreeing with the bell (AC-T1)", () => {
  // The Arena store counts at most the one in hand while offline.
  mockState = { incomingCount: 0, isLive: false };
  mockFreshIncoming = 2;
  const { result } = renderHook(() => useArenaTabBadge());
  expect(result.current).toEqual({ kind: "count", count: 2, label: "2 challenges", inIcon: true });
});

it("takes the larger of the Arena's count and the bell's fresh count", () => {
  mockState = { incomingCount: 3, isLive: true };
  mockFreshIncoming = 1;
  expect(renderHook(() => useArenaTabBadge()).result.current).toEqual({
    kind: "count",
    count: 3,
    label: "3 challenges",
    inIcon: true,
  });
  mockState = { incomingCount: 1, isLive: true };
  mockFreshIncoming = 2;
  expect(renderHook(() => useArenaTabBadge()).result.current).toEqual({
    kind: "count",
    count: 2,
    label: "2 challenges",
    inIcon: true,
  });
});

it("exposes the raw tab state for the Arena icon: the larger count and the live bit", () => {
  mockState = { incomingCount: 1, isLive: true };
  mockFreshIncoming = 4;
  expect(renderHook(() => useArenaTabState()).result.current).toEqual({
    incomingCount: 4,
    isLive: true,
    hasConfirm: false,
    incomingKnown: true,
  });
  mockBellLoaded = false;
  expect(renderHook(() => useArenaTabState()).result.current.incomingKnown).toBe(false);
  mockBellLoaded = true;
});

it("no red count once a manual go-offline dropped a tucked challenge (Q3): the bell stops counting it", () => {
  // The Arena cleared it (incomingCount 0) and the bell lists it as Missed.
  mockState = { incomingCount: 0, isLive: false };
  mockFreshIncoming = 0;
  expect(renderHook(() => useArenaTabBadge()).result.current).toBeNull();
});
