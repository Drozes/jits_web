import { describe, it, expect, vi } from "vitest";
import { markPracticeMatch } from "./mutations";
import { ATHLETE_GUARD_SELECT } from "./queries";

function mockClientWithRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as never, rpc };
}

describe("markPracticeMatch", () => {
  it("calls mark_practice_match with the event and returns the timestamps", async () => {
    const { client, rpc } = mockClientWithRpc({
      data: [
        {
          practice_match_offered_at: "2026-09-26T00:00:00Z",
          practice_match_completed_at: null,
        },
      ],
      error: null,
    });

    const result = await markPracticeMatch(client, "offered");

    expect(rpc).toHaveBeenCalledWith("mark_practice_match", { p_event: "offered" });
    expect(result).toEqual({
      ok: true,
      data: {
        practice_match_offered_at: "2026-09-26T00:00:00Z",
        practice_match_completed_at: null,
      },
    });
  });

  it("returns a Result error instead of throwing when the RPC fails", async () => {
    const { client } = mockClientWithRpc({
      data: null,
      error: { code: "P0001", message: "invalid event", details: "", hint: "", name: "PostgrestError" },
    });

    const result = await markPracticeMatch(client, "completed");

    expect(result.ok).toBe(false);
  });

  it("tolerates an empty row set", async () => {
    const { client } = mockClientWithRpc({ data: [], error: null });

    const result = await markPracticeMatch(client, "skipped");

    expect(result).toEqual({
      ok: true,
      data: { practice_match_offered_at: null, practice_match_completed_at: null },
    });
  });
});

describe("ATHLETE_GUARD_SELECT", () => {
  it("includes the practice match onboarding columns", () => {
    expect(ATHLETE_GUARD_SELECT).toContain("practice_match_offered_at");
    expect(ATHLETE_GUARD_SELECT).toContain("practice_match_completed_at");
  });
});
