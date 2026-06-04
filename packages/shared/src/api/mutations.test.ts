import { describe, it, expect, vi } from "vitest";
import { cancelSessionMatch } from "./mutations";

// ---------------------------------------------------------------------------
// cancelSessionMatch — thin wrapper over the cancel_session_match RPC
// ---------------------------------------------------------------------------

function mockClientWithRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as never, rpc };
}

describe("cancelSessionMatch", () => {
  it("calls cancel_session_match with the match id", async () => {
    const { client, rpc } = mockClientWithRpc({ data: { success: true }, error: null });

    const result = await cancelSessionMatch(client, "match-1");

    expect(rpc).toHaveBeenCalledWith("cancel_session_match", { p_match_id: "match-1" });
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("maps a P0001 not_participant error to NOT_PARTICIPANT", async () => {
    const { client } = mockClientWithRpc({
      data: null,
      error: {
        code: "P0001",
        hint: "not_participant",
        message: "You are not a participant in this match",
        details: "",
        name: "PostgrestError",
      },
    });

    const result = await cancelSessionMatch(client, "match-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_PARTICIPANT");
  });

  it("maps a P0001 invalid_status error to MATCH_NOT_PENDING", async () => {
    const { client } = mockClientWithRpc({
      data: null,
      error: {
        code: "P0001",
        hint: "invalid_status",
        message: "Match is not pending",
        details: "",
        name: "PostgrestError",
      },
    });

    const result = await cancelSessionMatch(client, "match-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MATCH_NOT_PENDING");
  });

  it("falls back to UNKNOWN for unmapped errors", async () => {
    const { client } = mockClientWithRpc({
      data: null,
      error: { code: "XX000", message: "boom", details: "", hint: "", name: "PostgrestError" },
    });

    const result = await cancelSessionMatch(client, "match-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNKNOWN");
  });
});
