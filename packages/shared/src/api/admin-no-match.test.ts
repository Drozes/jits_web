import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminListNoMatchVideos } from "./queries";

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as never, rpc };
}

const ROW = {
  video_id: "v1",
  match_id: "m1",
  uploaded_by: "a1",
  uploader_name: "Reyes",
  video_status: "analyzed",
  video_created_at: "2026-09-28T10:00:00Z",
  analyzed_at: "2026-09-28T10:05:00Z",
  analysis_id: "an1",
  no_match_reason: "An empty office.",
  match_type: "ranked",
  match_status: "completed",
  match_result: "submission",
  match_completed_at: "2026-09-28T09:58:00Z",
  participants: [
    { athlete_id: "a1", display_name: "Reyes", outcome: "win", elo_before: 1200, elo_after: 1216, elo_delta: 16 },
    { athlete_id: "a2", display_name: "Cole", outcome: "loss", elo_before: 1210, elo_after: 1194, elo_delta: -16 },
    { display_name: "no id" },
  ],
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("adminListNoMatchVideos (jr_be-0qf)", () => {
  it("calls the RPC with only the given args and maps rows, dropping malformed ones", async () => {
    const { client, rpc } = rpcClient({ data: [ROW, { video_id: "no match id" }], error: null });
    const r = await adminListNoMatchVideos(client, { limit: 50 });
    expect(rpc).toHaveBeenCalledWith("admin_list_no_match_videos", { p_limit: 50 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({
      video_id: "v1",
      match_type: "ranked",
      match_result: "submission",
      no_match_reason: "An empty office.",
    });
    expect(r.data[0].participants.map((p) => p.elo_delta)).toEqual([16, -16]);
  });

  it("sends no args by default (the backend's 30-day window)", async () => {
    const { client, rpc } = rpcClient({ data: [], error: null });
    expect(await adminListNoMatchVideos(client)).toEqual({ ok: true, data: [] });
    expect(rpc).toHaveBeenCalledWith("admin_list_no_match_videos", {});
  });

  it("maps not_admin to NOT_ADMIN", async () => {
    const { client } = rpcClient({ data: null, error: { code: "P0001", message: "x", details: "", hint: "not_admin" } });
    const r = await adminListNoMatchVideos(client);
    expect(!r.ok && r.error.code).toBe("NOT_ADMIN");
  });
});
