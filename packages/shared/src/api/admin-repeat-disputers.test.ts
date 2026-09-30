import { describe, it, expect, vi, beforeEach } from "vitest";
import { listRepeatDisputers } from "./queries";

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as never, rpc };
}

const ROW = {
  athlete_id: "a1",
  display_name: "Kai Reyes",
  lost_disputes_30d: 4,
  total_disputes_30d: 6,
  last_lost_at: "2026-09-28T10:00:00Z",
  lost_match_ids: ["m1", "m2", "m3", "m4"],
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("listRepeatDisputers (jr_be-ahn.6 / jits-02vo.11)", () => {
  it("calls the RPC with no args and maps rows in backend order, dropping malformed ones", async () => {
    const second = { ...ROW, athlete_id: "a2", display_name: null, lost_disputes_30d: "3", lost_match_ids: ["m9", null, ""] };
    const { client, rpc } = rpcClient({ data: [ROW, { display_name: "no id" }, second], error: null });
    const r = await listRepeatDisputers(client);
    expect(rpc).toHaveBeenCalledWith("admin_list_repeat_disputers");
    if (!r.ok) throw new Error("expected ok");
    expect(r.data).toEqual([
      ROW,
      {
        athlete_id: "a2",
        display_name: null,
        lost_disputes_30d: 3,
        total_disputes_30d: 6,
        last_lost_at: "2026-09-28T10:00:00Z",
        lost_match_ids: ["m9"],
      },
    ]);
  });

  it("returns [] for an empty or null result", async () => {
    expect(await listRepeatDisputers(rpcClient({ data: [], error: null }).client)).toEqual({ ok: true, data: [] });
    expect(await listRepeatDisputers(rpcClient({ data: null, error: null }).client)).toEqual({ ok: true, data: [] });
  });

  it("maps not_admin to NOT_ADMIN", async () => {
    const { client } = rpcClient({ data: null, error: { code: "P0001", message: "x", details: "", hint: "not_admin" } });
    const r = await listRepeatDisputers(client);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("NOT_ADMIN");
  });

  it.each(["PGRST202", "42883"])("maps a missing RPC (%s) to RPC_MISSING", async (code) => {
    const { client } = rpcClient({ data: null, error: { code, message: "Could not find the function", details: "", hint: "" } });
    const r = await listRepeatDisputers(client);
    if (r.ok) throw new Error("expected error");
    expect(r.error.code).toBe("RPC_MISSING");
  });

  it("maps a thrown client error to UNKNOWN", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network down"));
    const r = await listRepeatDisputers({ rpc } as never);
    if (r.ok) throw new Error("expected error");
    expect(r.error).toEqual({ code: "UNKNOWN", message: "network down" });
  });
});
