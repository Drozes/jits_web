/**
 * The Arena roster read.
 *
 * Two things here are load-bearing and both have bitten this codebase before:
 * the explicit limit (the RPC's default of 20 silently truncated the list
 * while presence stayed uncapped, so the online count under-reported), and
 * telling a failed read apart from an empty one (`getArenaData` logs the
 * PostgREST error and hands back the raw payload, jits-icei.5, so a null is
 * "we do not know", never "nobody is here").
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { ARENA_ROSTER_LIMIT } from "@/lib/arena/constants";

// ---- mocks ----

const mockGetArenaData = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getArenaData: (...args: unknown[]) => mockGetArenaData(...args),
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { useArenaRoster } from "@/lib/arena/use-arena-roster";

// ---- fixtures ----

const ROSTER = {
  looking_athletes: [
    {
      id: "a-1",
      display_name: "Alpha",
      current_elo: 1300,
      gym_name: "Gracie",
      looking_for_casual: false,
      looking_for_ranked: true,
      profile_photo_url: null,
      current_weight: 180,
    },
    {
      id: "a-2",
      display_name: "Bravo",
      current_elo: 1100,
      gym_name: null,
      looking_for_casual: true,
      looking_for_ranked: false,
      profile_photo_url: null,
      current_weight: null,
    },
  ],
  other_athletes: [],
  challenged_opponent_ids: ["a-2"],
  recent_activity: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetArenaData.mockResolvedValue(ROSTER);
});

describe("useArenaRoster", () => {
  it("asks for the full roster, not the RPC default", async () => {
    const { result } = renderHook(() => useArenaRoster(1200));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetArenaData).toHaveBeenCalledWith({}, ARENA_ROSTER_LIMIT);
    expect(ARENA_ROSTER_LIMIT).toBe(100);
  });

  it("maps the ELO gap and the ranked flag each row carries", async () => {
    const { result } = renderHook(() => useArenaRoster(1200));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.competitors).toEqual([
      expect.objectContaining({
        id: "a-1",
        displayName: "Alpha",
        eloDiff: 100,
        gymName: "Gracie",
        weight: 180,
        acceptsRanked: true,
      }),
      expect.objectContaining({
        id: "a-2",
        eloDiff: -100,
        gymName: undefined,
        weight: undefined,
        // Listed as looking, but not for ranked. The insert would be refused
        // by opponent_accepts_match_type, so the row must not offer one.
        acceptsRanked: false,
      }),
    ]);
    expect([...result.current.challengedIds]).toEqual(["a-2"]);
    expect(result.current.hasError).toBe(false);
  });

  it("reports a failed read as an error, NOT as an empty lobby", async () => {
    // The distinction is the whole point: an empty roster says "nobody is
    // looking", which is a claim about the world. A failed read knows nothing
    // and must not make that claim.
    mockGetArenaData.mockResolvedValue(null);
    const { result } = renderHook(() => useArenaRoster(1200));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasError).toBe(true);
    expect(result.current.competitors).toEqual([]);
  });

  it("treats a payload missing its roster array as a failed read too", async () => {
    mockGetArenaData.mockResolvedValue({ challenged_opponent_ids: [] });
    const { result } = renderHook(() => useArenaRoster(1200));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasError).toBe(true);
  });

  it("clears the error once a retry succeeds", async () => {
    mockGetArenaData.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useArenaRoster(1200));
    await waitFor(() => expect(result.current.hasError).toBe(true));

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.hasError).toBe(false));
    expect(result.current.competitors).toHaveLength(2);
    expect(result.current.isRefreshing).toBe(false);
  });
});
