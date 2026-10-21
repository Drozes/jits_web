/**
 * `getLatestTimekeeperRequest` (api/timekeeper.ts, timekeeper mode M2): the
 * newest `match_timekeeper_requests` row of a match the caller may read under
 * RLS, with the asked person's name. The asked person's sheet needs it after
 * a TK-N1 push (whose `timekeep_href` carries only the match), and the
 * athletes' picker after a pre-start drop-out (TK-D1). And
 * `getIncomingTimekeeperRequest`: the newest pending request sent to an
 * athlete, which the asked person's listener reads to catch a missed row.
 */
import { describe, it, expect, vi } from "vitest";
import { getIncomingTimekeeperRequest, getLatestTimekeeperRequest } from "./timekeeper";

/** A `.from()` chain that records each call and resolves `maybeSingle()` with `result`. */
function fromClient(result: { data?: unknown; error?: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  const from = vi.fn(() => chain);
  return { client: { from } as never, from, calls };
}

const ROW = {
  id: "q1",
  status: "accepted",
  invitee_id: "c",
  expires_at: "2026-10-20T10:02:00Z",
  invitee: { display_name: "Jo Cruz" },
};

describe("getLatestTimekeeperRequest", () => {
  it("reads the newest request of the match, with the invitee's name through the invitee foreign key", async () => {
    const { client, from, calls } = fromClient({ data: ROW });
    const res = await getLatestTimekeeperRequest(client, "M1");
    expect(from).toHaveBeenCalledWith("match_timekeeper_requests");
    const select = calls.find((c) => c.method === "select")?.args[0] as string;
    expect(select).toContain("invitee:athletes!match_timekeeper_requests_invitee_id_fkey(display_name)");
    expect(calls).toContainEqual({ method: "eq", args: ["match_id", "M1"] });
    // Newest first, with the id as the tie-break for two requests in the same instant.
    expect(calls.filter((c) => c.method === "order")).toEqual([
      { method: "order", args: ["created_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: false }] },
    ]);
    expect(calls).toContainEqual({ method: "limit", args: [1] });
    expect(res).toEqual({
      ok: true,
      data: { requestId: "q1", status: "accepted", inviteeId: "c", inviteeName: "Jo Cruz", expiresAt: "2026-10-20T10:02:00Z" },
    });
  });

  it("is null when the match has no request this caller can read", async () => {
    const { client } = fromClient({ data: null });
    expect(await getLatestTimekeeperRequest(client, "M1")).toEqual({ ok: true, data: null });
  });

  it("keeps the row when the invitee's name is not readable", async () => {
    const { client } = fromClient({ data: { ...ROW, invitee: null } });
    const res = await getLatestTimekeeperRequest(client, "M1");
    expect(res.ok && res.data?.inviteeName).toBe("");
  });

  it("maps a read error, and refuses a row it cannot shape", async () => {
    const failed = await getLatestTimekeeperRequest(
      fromClient({ error: { code: "42501", hint: "", message: "denied", details: "" } }).client,
      "M1",
    );
    expect(failed.ok).toBe(false);
    const odd = await getLatestTimekeeperRequest(fromClient({ data: { ...ROW, status: "weird" } }).client, "M1");
    expect(odd).toEqual({ ok: false, error: expect.objectContaining({ code: "UNKNOWN" }) });
  });
});

describe("getIncomingTimekeeperRequest", () => {
  const PENDING = { id: "q2", match_id: "M2", expires_at: "2026-10-20T10:02:00Z" };

  it("reads the newest pending request sent to the athlete", async () => {
    const { client, from, calls } = fromClient({ data: PENDING });
    const res = await getIncomingTimekeeperRequest(client, "me");
    expect(from).toHaveBeenCalledWith("match_timekeeper_requests");
    expect(calls).toContainEqual({ method: "select", args: ["id, match_id, expires_at"] });
    expect(calls).toContainEqual({ method: "eq", args: ["invitee_id", "me"] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "pending"] });
    // Newest first, with the id as the tie-break for two requests in the same instant.
    expect(calls.filter((c) => c.method === "order")).toEqual([
      { method: "order", args: ["created_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: false }] },
    ]);
    expect(calls).toContainEqual({ method: "limit", args: [1] });
    expect(res).toEqual({ ok: true, data: { requestId: "q2", matchId: "M2", expiresAt: "2026-10-20T10:02:00Z" } });
  });

  it("is null when nothing is pending for the athlete", async () => {
    expect(await getIncomingTimekeeperRequest(fromClient({ data: null }).client, "me")).toEqual({ ok: true, data: null });
  });

  it("maps a read error, and refuses a row it cannot shape", async () => {
    const failed = await getIncomingTimekeeperRequest(
      fromClient({ error: { code: "42501", hint: "", message: "denied", details: "" } }).client,
      "me",
    );
    expect(failed.ok).toBe(false);
    const odd = await getIncomingTimekeeperRequest(fromClient({ data: { ...PENDING, match_id: null } }).client, "me");
    expect(odd).toEqual({ ok: false, error: expect.objectContaining({ code: "UNKNOWN" }) });
  });
});
