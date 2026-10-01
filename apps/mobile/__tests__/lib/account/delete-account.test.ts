/**
 * lib/account/delete-account.ts: the edge function call and its result
 * mapping. supabase-js resolves with { data, error }; it never rejects.
 */
import { deleteAccount, isDeleteConfirmed } from "@/lib/account/delete-account";

function client(result: { data: unknown; error: unknown }) {
  return { functions: { invoke: jest.fn(() => Promise.resolve(result)) } };
}

function httpError(status: number, body: unknown) {
  return { name: "FunctionsHttpError", context: new Response(JSON.stringify(body), { status }) };
}

describe("deleteAccount", () => {
  it("posts the typed confirmation to delete-account", async () => {
    const c = client({ data: { ok: true }, error: null });
    expect(await deleteAccount(c as never)).toEqual({ ok: true });
    expect(c.functions.invoke).toHaveBeenCalledWith("delete-account", { body: { confirm: "DELETE" } });
  });

  it("maps a 401 to not_authenticated", async () => {
    const c = client({ data: null, error: httpError(401, { ok: false, code: "not_authenticated" }) });
    expect(await deleteAccount(c as never)).toEqual({ ok: false, code: "not_authenticated" });
  });

  it("maps a 400 to confirm_required", async () => {
    const c = client({ data: null, error: httpError(400, { ok: false, code: "confirm_required" }) });
    expect(await deleteAccount(c as never)).toEqual({ ok: false, code: "confirm_required" });
  });

  it("maps a 500 or a network error to failed", async () => {
    const c500 = client({ data: null, error: httpError(500, { ok: false, code: "delete_failed" }) });
    expect(await deleteAccount(c500 as never)).toEqual({ ok: false, code: "failed" });
    const net = client({ data: null, error: { name: "FunctionsFetchError", context: new Error("offline") } });
    expect(await deleteAccount(net as never)).toEqual({ ok: false, code: "failed" });
  });

  it("treats an unexpected success body as failed", async () => {
    expect(await deleteAccount(client({ data: "", error: null }) as never)).toEqual({ ok: false, code: "failed" });
  });
});

describe("isDeleteConfirmed", () => {
  it.each([
    ["DELETE", true],
    [" DELETE ", true],
    ["delete", false],
    ["DELET", false],
    ["", false],
  ])("%j -> %s", (typed, expected) => {
    expect(isDeleteConfirmed(typed)).toBe(expected);
  });
});
