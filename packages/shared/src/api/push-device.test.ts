import { describe, it, expect, vi } from "vitest";
import { removePushDeviceByToken } from "./mutations";

function client(result: { error: unknown }) {
  const eq = vi.fn(() => Promise.resolve(result));
  const del = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ delete: del }));
  return { supabase: { from } as never, from, del, eq };
}

describe("removePushDeviceByToken", () => {
  it("deletes push_subscriptions rows with this token (RLS keeps it to the caller's own)", async () => {
    const { supabase, from, del, eq } = client({ error: null });
    const result = await removePushDeviceByToken(supabase, "ExponentPushToken[x]");
    expect(from).toHaveBeenCalledWith("push_subscriptions");
    expect(del).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith("token", "ExponentPushToken[x]");
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("maps an error to a Result", async () => {
    const { supabase } = client({ error: { code: "42501", message: "denied", details: "", hint: "" } });
    const result = await removePushDeviceByToken(supabase, "t");
    expect(result.ok).toBe(false);
  });
});
