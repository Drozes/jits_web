import { describe, it, expect, vi } from "vitest";
import { confirmMatchResult } from "./mutations";
import { TIMEKEEPER_DECK_MESSAGES } from "./timekeeper";

// ---------------------------------------------------------------------------
// confirmMatchResult: the optional expected edit count (jits_web
// specs/timekeeper-mode R18, A8; jr_be 024 4.5). Omitted, the call and its
// error mapping are exactly the two-athlete confirm; given (timekeeper mode
// only), it is sent as p_expected_edit_count and a stale count maps to
// RESULT_CHANGED.
// ---------------------------------------------------------------------------

function clientWith(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as never, rpc };
}

const raised = (hint: string, message = "refused") => ({
  data: null,
  error: { code: "P0001", hint, message, details: "", name: "PostgrestError" },
});

describe("confirmMatchResult", () => {
  it("without a count: the shipped call, only the match id", async () => {
    const { client, rpc } = clientWith({ data: { success: true }, error: null });
    const result = await confirmMatchResult(client, "match-1");
    expect(rpc).toHaveBeenCalledWith("confirm_match_result", { p_match_id: "match-1" });
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("with a count: sends it as p_expected_edit_count, zero included", async () => {
    const { client, rpc } = clientWith({ data: { success: true, already_confirmed: false }, error: null });
    await confirmMatchResult(client, "match-1", 0);
    expect(rpc).toHaveBeenLastCalledWith("confirm_match_result", { p_match_id: "match-1", p_expected_edit_count: 0 });
    await confirmMatchResult(client, "match-1", 2);
    expect(rpc).toHaveBeenLastCalledWith("confirm_match_result", { p_match_id: "match-1", p_expected_edit_count: 2 });
  });

  it("with a count: a stale one is RESULT_CHANGED, with the deck's TK-RC4 title as its message", async () => {
    const { client } = clientWith(raised("result_changed", "The result changed since it was shown"));
    const result = await confirmMatchResult(client, "match-1", 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RESULT_CHANGED");
      expect(result.error.message).toBe(TIMEKEEPER_DECK_MESSAGES.resultChanged);
    }
  });

  it("with a count: the shared refusals still map through the shared table", async () => {
    const { client } = clientWith(raised("not_participant"));
    const result = await confirmMatchResult(client, "match-1", 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_PARTICIPANT");
  });

  it("without a count: result_changed is not a hint the two-athlete confirm knows (UNKNOWN, as before)", async () => {
    const { client } = clientWith(raised("result_changed", "The result changed since it was shown"));
    const result = await confirmMatchResult(client, "match-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN");
      expect(result.error.message).toBe("The result changed since it was shown");
    }
  });

  it("a payload without success is still UNKNOWN in both modes", async () => {
    for (const count of [undefined, 3]) {
      const { client } = clientWith({ data: { success: false, error: "nope" }, error: null });
      const result = await confirmMatchResult(client, "match-1", count);
      expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "nope" } });
    }
  });
});
