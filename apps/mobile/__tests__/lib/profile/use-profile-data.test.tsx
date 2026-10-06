/**
 * useProfileData's error toast (release gate R1): the Matches tab reads the
 * stats quietly (`quiet: true`), so a failed background refetch (offline
 * refocus, match exit) never toasts there; the Profile tab keeps its toast.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { from: jest.fn() } }));
const mockStats = jest.fn();
const mockHistory = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getAthleteStatsRpc: (...a: unknown[]) => mockStats(...a),
  getMatchHistory: (...a: unknown[]) => mockHistory(...a),
}));
const mockToastError = jest.fn();
jest.mock("@/components/ui/toast", () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a), success: jest.fn() } }));

import { useProfileData } from "@/lib/profile/use-profile-data";

const STATS = { wins: 1, losses: 0, draws: 0, winRate: 1, winStreak: 1, bestWinStreak: 1, totalMatches: 1 };
let seq = 0;

beforeEach(() => {
  jest.clearAllMocks();
  seq += 1;
  mockStats.mockResolvedValue(STATS);
  mockHistory.mockResolvedValue([]);
});

describe("useProfileData error toast", () => {
  it("quiet (the Matches tab): a failed background refetch toasts nothing and keeps the stats", async () => {
    const { result } = renderHook(() => useProfileData(`quiet-${seq}`, null, { quiet: true }));
    await waitFor(() => expect(result.current.stats).toEqual(STATS));
    mockHistory.mockRejectedValue(new Error("offline"));
    await act(async () => {
      result.current.onRefresh();
    });
    await waitFor(() => expect(mockHistory).toHaveBeenCalledTimes(2));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockToastError).not.toHaveBeenCalled();
    expect(result.current.stats).toEqual(STATS);
  });

  it("quiet: a failed first read toasts nothing either", async () => {
    mockHistory.mockRejectedValue(new Error("offline"));
    renderHook(() => useProfileData(`quiet-cold-${seq}`, null, { quiet: true }));
    await waitFor(() => expect(mockHistory).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("default (the Profile tab): a failed refetch still toasts", async () => {
    const { result } = renderHook(() => useProfileData(`loud-${seq}`, null));
    await waitFor(() => expect(result.current.stats).toEqual(STATS));
    mockHistory.mockRejectedValue(new Error("offline"));
    await act(async () => {
      result.current.onRefresh();
    });
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Could not load profile"));
  });
});
