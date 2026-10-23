/**
 * The Rankings ladder query (Rating V9, jr_be spec 019 section 7.4): only
 * athletes who have played at least one rated match. Every athlete starts at
 * 1500, so a never-rated one would otherwise sit mid-ladder. The status
 * filter, the rating order and the limit of 50 are unchanged.
 */
import { renderHook, waitFor } from "@testing-library/react-native";

type Call = { method: string; args: unknown[] };
const mockCalls: Call[] = [];
let mockRows: unknown[] = [];

jest.mock("@/lib/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gt", "order"]) {
    builder[method] = (...args: unknown[]) => {
      mockCalls.push({ method, args });
      return builder;
    };
  }
  builder.limit = (...args: unknown[]) => {
    mockCalls.push({ method: "limit", args });
    return Promise.resolve({ data: mockRows, error: null });
  };
  return {
    supabase: {
      from: (...args: unknown[]) => {
        mockCalls.push({ method: "from", args });
        return builder;
      },
    },
  };
});
jest.mock("@jits/shared/api/queries", () => ({
  getAthletesStatsRpc: () => Promise.resolve(new Map()),
}));
jest.mock("@/components/ui", () => ({ toast: { error: jest.fn() } }));

import { useLeaderboardData } from "@/lib/leaderboard/use-leaderboard-data";

beforeEach(() => {
  mockCalls.length = 0;
  mockRows = [];
});

it("asks only for active athletes with at least one rated match, best first, top 50", async () => {
  mockRows = [
    { id: "a", display_name: "Ana", current_elo: 1662, primary_gym_id: null, profile_photo_url: null, gender: null, gyms: null },
  ];
  const { result } = renderHook(() => useLeaderboardData("viewer-1"));
  await waitFor(() => expect(result.current.athletes).not.toBeNull());
  expect(mockCalls.find((c) => c.method === "from")?.args).toEqual(["athletes"]);
  expect(mockCalls.filter((c) => c.method === "gt").map((c) => c.args)).toEqual([["rated_match_count", 0]]);
  expect(mockCalls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([["status", "active"]]);
  expect(mockCalls.find((c) => c.method === "order")?.args).toEqual(["current_elo", { ascending: false }]);
  expect(mockCalls.find((c) => c.method === "limit")?.args).toEqual([50]);
  expect(result.current.athletes?.map((a) => [a.id, a.rank, a.currentElo])).toEqual([["a", 1, 1662]]);
});
