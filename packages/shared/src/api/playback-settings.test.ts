import { describe, it, expect, vi } from "vitest";
import { getPlaybackSettings } from "./playback-settings";

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as never, rpc };
}

describe("getPlaybackSettings", () => {
  it("calls get_playback_settings with no args and returns the raw JSON", async () => {
    const body = { version: 1, adaptive: false };
    const { client, rpc } = rpcClient({ data: body, error: null });
    await expect(getPlaybackSettings(client)).resolves.toEqual({ ok: true, data: body });
    expect(rpc).toHaveBeenCalledWith("get_playback_settings");
  });

  it("maps an RPC error through mapPostgrestError", async () => {
    const { client } = rpcClient({ data: null, error: { code: "42501", message: "denied", details: "", hint: "" } });
    const r = await getPlaybackSettings(client);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RLS_VIOLATION");
  });

  it("never throws: a rejecting or throwing client is ok:false", async () => {
    const rejecting = { rpc: vi.fn().mockRejectedValue(new Error("offline")) } as never;
    await expect(getPlaybackSettings(rejecting)).resolves.toEqual({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const throwing = {
      rpc: () => {
        throw new Error("boom");
      },
    } as never;
    expect((await getPlaybackSettings(throwing)).ok).toBe(false);
    expect((await getPlaybackSettings({} as never)).ok).toBe(false);
  });

  it("passes a malformed body through untouched (the caller validates)", async () => {
    const { client } = rpcClient({ data: "nope", error: null });
    expect(await getPlaybackSettings(client)).toEqual({ ok: true, data: "nope" });
  });
});
