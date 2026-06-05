import { describe, it, expect, vi } from "vitest";
import {
  getGymRoster,
  getGymAthleteDetail,
  getGymStats,
  getGymStatsByEloRange,
  getGymLadder,
} from "./queries";

// ---------------------------------------------------------------------------
// Gym-owner portal RPC wrappers (epic jits-iwd).
//
// Each wrapper is a thin shim over a SECURITY DEFINER RPC: it maps snake_case
// BE rows/JSONB to camelCase, normalizes BIGINT counts (which arrive as numbers
// or strings) to numbers, and threads P0001 manager-gating errors through the
// Result<T> contract. These tests mock supabase.rpc and assert the call shape +
// the mapped output, mirroring mutations.test.ts / queries.test.ts.
// ---------------------------------------------------------------------------

function mockClientWithRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as never, rpc };
}

const NOT_MANAGER_ERROR = {
  code: "P0001",
  hint: "not_gym_manager",
  message: "Not authorized: caller is not a manager of this gym",
  details: "",
  name: "PostgrestError",
};

describe("getGymRoster", () => {
  it("calls get_gym_roster with the gym id and maps rows to camelCase", async () => {
    const { client, rpc } = mockClientWithRpc({
      data: [
        {
          athlete_id: "a1",
          display_name: "Rickson",
          current_elo: 1850,
          elo_delta: 12,
          last_active: "2026-06-01T00:00:00Z",
          is_provisional: false,
          // BIGINT columns can serialize as strings
          wins: "10",
          losses: "2",
          draws: "1",
        },
      ],
      error: null,
    });

    const result = await getGymRoster(client, "gym-1");

    expect(rpc).toHaveBeenCalledWith("get_gym_roster", { p_gym_id: "gym-1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        {
          athleteId: "a1",
          displayName: "Rickson",
          currentElo: 1850,
          eloDelta: 12,
          lastActive: "2026-06-01T00:00:00Z",
          isProvisional: false,
          wins: 10,
          losses: 2,
          draws: 1,
        },
      ]);
    }
  });

  it("returns an empty array for a null payload", async () => {
    const { client } = mockClientWithRpc({ data: null, error: null });
    const result = await getGymRoster(client, "gym-1");
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("maps a not_gym_manager P0001 error to NOT_GYM_MANAGER", async () => {
    const { client } = mockClientWithRpc({ data: null, error: NOT_MANAGER_ERROR });
    const result = await getGymRoster(client, "gym-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_GYM_MANAGER");
  });
});

describe("getGymAthleteDetail", () => {
  it("calls get_gym_athlete_detail with both ids and maps the JSONB payload", async () => {
    const { client, rpc } = mockClientWithRpc({
      data: {
        current_elo: 1700,
        peak_elo: 1820,
        wins: 8,
        losses: 4,
        draws: 0,
        win_rate: 0.6667,
        elo_trend: [{ rating_after: 1700, delta: 10, created_at: "2026-06-01T00:00:00Z" }],
        last_matches: [
          {
            opponent_name: "Royce",
            result: "win",
            submission: "Armbar",
            elo_delta: 10,
            occurred_at: "2026-06-01T00:00:00Z",
          },
        ],
      },
      error: null,
    });

    const result = await getGymAthleteDetail(client, "gym-1", "a1");

    expect(rpc).toHaveBeenCalledWith("get_gym_athlete_detail", {
      p_gym_id: "gym-1",
      p_athlete_id: "a1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.currentElo).toBe(1700);
      expect(result.data.peakElo).toBe(1820);
      expect(result.data.winRate).toBeCloseTo(0.6667, 4);
      expect(result.data.eloTrend).toHaveLength(1);
      expect(result.data.lastMatches[0].opponent_name).toBe("Royce");
    }
  });

  it("falls back to zeros / empty arrays for a null payload", async () => {
    const { client } = mockClientWithRpc({ data: null, error: null });
    const result = await getGymAthleteDetail(client, "gym-1", "a1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        currentElo: 0,
        peakElo: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        eloTrend: [],
        lastMatches: [],
      });
    }
  });

  it("maps a not_member P0001 error to NOT_GYM_MEMBER", async () => {
    const { client } = mockClientWithRpc({
      data: null,
      error: {
        code: "P0001",
        hint: "not_member",
        message: "Athlete is not a member of this gym",
        details: "",
        name: "PostgrestError",
      },
    });
    const result = await getGymAthleteDetail(client, "gym-1", "a1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_GYM_MEMBER");
  });
});

describe("getGymStats", () => {
  it("passes the default range and maps the JSONB payload", async () => {
    const { client, rpc } = mockClientWithRpc({
      data: {
        avg_elo: 1650.5,
        momentum: 4.2,
        submission_rate: 0.55,
        draw_rate: 0.1,
        avg_elo_on_draw: 1600,
        winning_submissions: [{ name: "Armbar", count: 5, pct: 0.5 }],
        losing_submissions: [],
        avg_win_time: 120.5,
        avg_loss_time: 120.5,
        elo_trend: [{ day: "2026-06-01", net_delta: 30 }],
      },
      error: null,
    });

    const result = await getGymStats(client, "gym-1");

    expect(rpc).toHaveBeenCalledWith("get_gym_stats", {
      p_gym_id: "gym-1",
      p_range: "90d",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.avgElo).toBe(1650.5);
      expect(result.data.momentum).toBe(4.2);
      expect(result.data.submissionRate).toBe(0.55);
      expect(result.data.drawRate).toBe(0.1);
      expect(result.data.avgEloOnDraw).toBe(1600);
      expect(result.data.winningSubmissions).toEqual([{ name: "Armbar", count: 5, pct: 0.5 }]);
      expect(result.data.losingSubmissions).toEqual([]);
      expect(result.data.eloTrend).toEqual([{ day: "2026-06-01", net_delta: 30 }]);
    }
  });

  it("forwards an explicit range token", async () => {
    const { client, rpc } = mockClientWithRpc({ data: {}, error: null });
    await getGymStats(client, "gym-1", "30d");
    expect(rpc).toHaveBeenCalledWith("get_gym_stats", {
      p_gym_id: "gym-1",
      p_range: "30d",
    });
  });

  it("maps a manager-gating error to NOT_GYM_MANAGER", async () => {
    const { client } = mockClientWithRpc({ data: null, error: NOT_MANAGER_ERROR });
    const result = await getGymStats(client, "gym-1", "all");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_GYM_MANAGER");
  });
});

describe("getGymStatsByEloRange", () => {
  it("unwraps the brackets array and normalizes counts", async () => {
    const { client, rpc } = mockClientWithRpc({
      data: {
        brackets: [
          {
            bracket: "1900+",
            athlete_count: "3",
            match_count: "12",
            avg_elo: 1950,
            momentum: 8,
            submission_rate: 0.6,
            draw_rate: 0.05,
            avg_win_time: 90,
            avg_loss_time: 90,
            top_winning_sub: "Triangle",
            top_losing_sub: null,
          },
        ],
      },
      error: null,
    });

    const result = await getGymStatsByEloRange(client, "gym-1", "all");

    expect(rpc).toHaveBeenCalledWith("get_gym_stats_by_elo_range", {
      p_gym_id: "gym-1",
      p_range: "all",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        bracket: "1900+",
        athleteCount: 3,
        matchCount: 12,
        avgElo: 1950,
        momentum: 8,
        submissionRate: 0.6,
        drawRate: 0.05,
        avgWinTime: 90,
        avgLossTime: 90,
        topWinningSub: "Triangle",
        topLosingSub: null,
      });
    }
  });

  it("returns an empty array when brackets is missing", async () => {
    const { client } = mockClientWithRpc({ data: {}, error: null });
    const result = await getGymStatsByEloRange(client, "gym-1");
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("maps a manager-gating error to NOT_GYM_MANAGER", async () => {
    const { client } = mockClientWithRpc({ data: null, error: NOT_MANAGER_ERROR });
    const result = await getGymStatsByEloRange(client, "gym-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_GYM_MANAGER");
  });
});

describe("getGymLadder", () => {
  it("omits p_city when no city is given and maps rows", async () => {
    const { client, rpc } = mockClientWithRpc({
      data: [
        {
          gym_id: "g1",
          gym_name: "Gracie Barra",
          city: "Austin",
          athlete_count: "20",
          match_count: "100",
          avg_elo: 1620,
          momentum: 3.5,
        },
      ],
      error: null,
    });

    const result = await getGymLadder(client);

    expect(rpc).toHaveBeenCalledWith("get_gym_ladder", { p_range: "90d" });
    expect(result).toEqual([
      {
        gymId: "g1",
        gymName: "Gracie Barra",
        city: "Austin",
        athleteCount: 20,
        matchCount: 100,
        avgElo: 1620,
        momentum: 3.5,
      },
    ]);
  });

  it("forwards an explicit city + range filter", async () => {
    const { client, rpc } = mockClientWithRpc({ data: [], error: null });
    await getGymLadder(client, { city: "Denver", range: "30d" });
    expect(rpc).toHaveBeenCalledWith("get_gym_ladder", {
      p_city: "Denver",
      p_range: "30d",
    });
  });

  it("returns an empty array (does not throw) on error", async () => {
    const { client } = mockClientWithRpc({
      data: null,
      error: { code: "XX000", message: "boom", details: "", hint: "", name: "PostgrestError" },
    });
    const result = await getGymLadder(client);
    expect(result).toEqual([]);
  });
});
