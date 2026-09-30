import { describe, expect, it, vi } from "vitest";
import { setGymInstagramHandle } from "./mutations";

function client(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { supabase: { rpc } as never, rpc };
}

const p0001 = (hint: string) => ({
  code: "P0001",
  hint,
  message: "x",
  details: "",
  name: "PostgrestError",
});

describe("setGymInstagramHandle", () => {
  it("calls set_gym_instagram_handle and maps an applied write", async () => {
    const { supabase, rpc } = client({
      data: { gym_id: "g1", instagram_handle: "atos", applied: true },
      error: null,
    });
    const res = await setGymInstagramHandle(supabase, { gymId: "g1", handle: "atos" });
    expect(rpc).toHaveBeenCalledWith("set_gym_instagram_handle", {
      p_gym_id: "g1",
      p_handle: "atos",
    });
    expect(res).toEqual({
      ok: true,
      data: { gymId: "g1", instagramHandle: "atos", applied: true },
    });
  });

  it("returns applied=false with the existing handle as success, not an error", async () => {
    const { supabase } = client({
      data: { gym_id: "g1", instagram_handle: "existing", applied: false },
      error: null,
    });
    const res = await setGymInstagramHandle(supabase, { gymId: "g1", handle: "mine" });
    expect(res).toEqual({
      ok: true,
      data: { gymId: "g1", instagramHandle: "existing", applied: false },
    });
  });

  it.each([
    ["not_found", "GYM_NOT_FOUND", "Gym not found."],
    ["not_authorized", "NOT_AUTHORIZED", "You can't set this gym's Instagram handle."],
    ["invalid_instagram_handle", "UNKNOWN", "That Instagram handle isn't valid."],
  ])("maps the %s hint with a gym-specific message", async (hint, code, message) => {
    const { supabase } = client({ data: null, error: p0001(hint) });
    const res = await setGymInstagramHandle(supabase, { gymId: "g1", handle: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(code);
      expect(res.error.message).toBe(message);
    }
  });
});
