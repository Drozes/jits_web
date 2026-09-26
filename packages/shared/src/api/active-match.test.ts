/**
 * getMyActiveMatch (jits-r9a): Home's "Resume your match" read.
 *
 * Asserts the exact filter it sends (my active participant row via the
 * `!inner` embed, open statuses only, the resume window on created OR started)
 * and how it shapes the result, including the opponent name from
 * `get_match_details` and a quiet null name when that read fails.
 */
import { describe, it, expect, vi } from "vitest";
import { getMyActiveMatch } from "./queries";
import { MATCH_RESUME_WINDOW_MS } from "../constants";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const ME = "me-1";

function mockClient(opts: {
  rows?: Array<{ id: string; status: string }>;
  error?: { message: string; code?: string } | null;
  details?: unknown;
  detailsError?: unknown;
}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ["select", "eq", "in", "or", "order"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return chain;
    };
  }
  chain.limit = (...args: unknown[]) => {
    calls.push(["limit", ...args]);
    return Promise.resolve({ data: opts.error ? null : (opts.rows ?? []), error: opts.error ?? null });
  };
  const from = vi.fn(() => chain);
  const rpc = vi.fn(() =>
    Promise.resolve({ data: opts.details ?? null, error: opts.detailsError ?? null }),
  );
  return { client: { from, rpc } as never, from, rpc, calls };
}

const details = {
  match: { id: "m1", status: "in_progress" },
  participants: [
    { athlete_id: ME, display_name: "Me" },
    { athlete_id: "opp-1", display_name: "Demo Red" },
  ],
};

describe("getMyActiveMatch", () => {
  it("reads only my open matches inside the resume window, newest first", async () => {
    const { client, from, calls } = mockClient({ rows: [] });
    await getMyActiveMatch(client, ME, NOW);

    const since = new Date(NOW - MATCH_RESUME_WINDOW_MS).toISOString();
    expect(from).toHaveBeenCalledWith("matches");
    expect(calls).toEqual([
      ["select", "id, status, match_participants!inner(athlete_id, status)"],
      ["eq", "match_participants.athlete_id", ME],
      ["eq", "match_participants.status", "active"],
      ["in", "status", ["pending", "in_progress"]],
      ["or", `created_at.gte.${since},started_at.gte.${since}`],
      ["order", "created_at", { ascending: false }],
      ["limit", 1],
    ]);
  });

  it("returns null, with no details read, when nothing is open", async () => {
    const { client, rpc } = mockClient({ rows: [] });
    expect(await getMyActiveMatch(client, ME, NOW)).toEqual({ ok: true, data: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the match with the opponent's name", async () => {
    const { client, rpc } = mockClient({ rows: [{ id: "m1", status: "in_progress" }], details });
    expect(await getMyActiveMatch(client, ME, NOW)).toEqual({
      ok: true,
      data: { matchId: "m1", status: "in_progress", opponentName: "Demo Red" },
    });
    expect(rpc).toHaveBeenCalledWith("get_match_details", { p_match_id: "m1" });
  });

  it("keeps a pending match pending", async () => {
    const { client } = mockClient({ rows: [{ id: "m1", status: "pending" }], details });
    const res = await getMyActiveMatch(client, ME, NOW);
    expect(res.ok && res.data?.status).toBe("pending");
  });

  it("still offers the match when the details read fails, just without a name", async () => {
    const { client } = mockClient({
      rows: [{ id: "m1", status: "in_progress" }],
      detailsError: { message: "boom" },
    });
    expect(await getMyActiveMatch(client, ME, NOW)).toEqual({
      ok: true,
      data: { matchId: "m1", status: "in_progress", opponentName: null },
    });
  });

  it("maps a read error to a DomainError", async () => {
    const { client, rpc } = mockClient({ error: { message: "nope", code: "42501" } });
    const res = await getMyActiveMatch(client, ME, NOW);
    expect(res.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
