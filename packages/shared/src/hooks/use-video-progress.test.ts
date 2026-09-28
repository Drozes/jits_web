// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useVideoProgress } from "./use-video-progress";

function snapshot(over: Record<string, unknown> = {}) {
  return {
    video_id: "v1",
    status: "analyzed",
    chunk_count: 2,
    chunks_completed: 2,
    failed_chunk_count: 0,
    requested_tier: "standard",
    slice_started_at: null,
    slice_completed_at: null,
    merge_started_at: null,
    merge_completed_at: null,
    latest_error_message: null,
    chunks: [],
    ...over,
  };
}

function createClient(rpcResult: { data: unknown; error: unknown }) {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn().mockResolvedValue("ok"),
  };
}

async function load(rpcData: unknown) {
  const client = createClient({ data: rpcData, error: null });
  const { result } = renderHook(() => useVideoProgress(client as never, "v1"));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  return result.current.data!;
}

describe("useVideoProgress match detection (jr_be-0qf)", () => {
  it("passes an explicit no-match through with its trimmed reason", async () => {
    const data = await load(snapshot({ match_detected: false, no_match_reason: " Nobody is on the mat. " }));
    expect(data.match_detected).toBe(false);
    expect(data.no_match_reason).toBe("Nobody is on the mat.");
    expect(data.status).toBe("analyzed");
  });

  it("keeps true and drops a reason", async () => {
    const data = await load(snapshot({ match_detected: true, no_match_reason: "stray" }));
    expect(data.match_detected).toBe(true);
    expect(data.no_match_reason).toBeNull();
  });

  it.each([
    ["null (not analysed yet / legacy)", { match_detected: null, no_match_reason: null }],
    ["absent (older backend)", {}],
  ])("reads match_detected %s as null", async (_label, over) => {
    const data = await load(snapshot({ status: "analyzing", ...over }));
    expect(data.match_detected).toBeNull();
    expect(data.no_match_reason).toBeNull();
  });
});
