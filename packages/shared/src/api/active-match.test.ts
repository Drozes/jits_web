/**
 * getMyActiveMatch (jits-r9a): Home's "Resume your match" read.
 *
 * Asserts the exact filter it sends (my active participant row via the
 * `!inner` embed, open statuses only, the resume window on created OR started)
 * and how it shapes the result, including the opponent name from
 * `get_match_details` and a quiet null name when that read fails.
 *
 * Timekeeper mode (spec 9.1, review tech M9; M1): only when that read finds
 * nothing, a second read keeps a timekeeper-mode pending match open while its
 * pick deadline runs or a timekeeper is seated. `calls` is the shipped read,
 * unchanged; `tkCalls` is the second one.
 */
import { describe, it, expect, vi } from "vitest";
import { getMyActiveMatch } from "./queries";
import { ARENA_CHALLENGE_FRESH_MS, MATCH_RESUME_WINDOW_MS } from "../constants";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const ME = "me-1";

function mockClient(opts: {
  rows?: Array<{ id: string; status: string }>;
  error?: { message: string; code?: string } | null;
  /** The timekeeper-mode pending read (the second `from("matches")`). */
  tkRows?: Array<{ id: string; status: string }>;
  tkError?: { message: string; code?: string } | null;
  details?: unknown;
  detailsError?: unknown;
}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const tkCalls: Array<[string, ...unknown[]]> = [];
  let reads = 0;
  const from = vi.fn(() => {
    const first = reads++ === 0;
    const log = first ? calls : tkCalls;
    const rows = first ? opts.rows : opts.tkRows;
    const error = first ? opts.error : opts.tkError;
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const m of ["select", "eq", "is", "in", "or", "not", "order"]) {
      chain[m] = (...args: unknown[]) => {
        log.push([m, ...args]);
        return chain;
      };
    }
    chain.limit = (...args: unknown[]) => {
      log.push(["limit", ...args]);
      return Promise.resolve({ data: error ? null : (rows ?? []), error: error ?? null });
    };
    return chain;
  });
  const rpc = vi.fn(() =>
    Promise.resolve({ data: opts.details ?? null, error: opts.detailsError ?? null }),
  );
  return { client: { from, rpc } as never, from, rpc, calls, tkCalls };
}

const details = {
  match: { id: "m1", status: "in_progress" },
  participants: [
    { athlete_id: ME, display_name: "Me" },
    { athlete_id: "opp-1", display_name: "Demo Red" },
  ],
};

describe("getMyActiveMatch", () => {
  it("reads only my open Arena matches, 60 min in progress / 10 min pending, newest first", async () => {
    const { client, from, calls } = mockClient({ rows: [] });
    await getMyActiveMatch(client, ME, NOW);

    const live = new Date(NOW - MATCH_RESUME_WINDOW_MS).toISOString();
    const pending = new Date(NOW - ARENA_CHALLENGE_FRESH_MS).toISOString();
    expect(MATCH_RESUME_WINDOW_MS).toBe(60 * 60_000);
    expect(ARENA_CHALLENGE_FRESH_MS).toBe(10 * 60_000);
    expect(from).toHaveBeenCalledWith("matches");
    expect(calls).toEqual([
      ["select", "id, status, match_participants!inner(athlete_id, status)"],
      ["eq", "match_participants.athlete_id", ME],
      ["eq", "match_participants.status", "active"],
      // Mobile is Arena-only: session matches are never offered.
      ["is", "session_id", null],
      ["in", "status", ["pending", "in_progress"]],
      [
        "or",
        `and(status.eq.in_progress,or(created_at.gte.${live},started_at.gte.${live})),` +
          `and(status.eq.pending,created_at.gte.${pending})`,
      ],
      ["order", "created_at", { ascending: false }],
      ["limit", 1],
    ]);
  });

  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const orArg = (calls: Array<[string, ...unknown[]]>) =>
    calls.find((c) => c[0] === "or")?.[1] as string;

  it("leaves out left matches from the PENDING branch only", async () => {
    const { client, calls } = mockClient({ rows: [] });
    await getMyActiveMatch(client, ME, NOW, [A, B]);

    const live = new Date(NOW - MATCH_RESUME_WINDOW_MS).toISOString();
    const pending = new Date(NOW - ARENA_CHALLENGE_FRESH_MS).toISOString();
    // An in_progress match left by accident (load error, back while loading)
    // stays resumable: its branch carries no exclusion.
    expect(orArg(calls)).toBe(
      `and(status.eq.in_progress,or(created_at.gte.${live},started_at.gte.${live})),` +
        `and(status.eq.pending,created_at.gte.${pending},id.not.in.(${A},${B}))`,
    );
    expect(calls.some((c) => c[0] === "not")).toBe(false);
  });

  it("drops anything that is not a UUID before it reaches the filter", async () => {
    const { client, calls } = mockClient({ rows: [] });
    await getMyActiveMatch(client, ME, NOW, ["m-1),id.eq.x", A, "nope"]);
    expect(orArg(calls)).toContain(`id.not.in.(${A}))`);
    expect(orArg(calls)).not.toContain("nope");
    expect(orArg(calls)).not.toContain("id.eq.x");
  });

  it("sends no exclusion when nothing (valid) was left", async () => {
    for (const ids of [[], ["not-a-uuid"]]) {
      const { client, calls } = mockClient({ rows: [] });
      await getMyActiveMatch(client, ME, NOW, ids);
      expect(orArg(calls)).not.toContain("id.not.in");
    }
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

describe("getMyActiveMatch: a timekeeper-mode pending match (spec 9.1, M1)", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const nowIso = new Date(NOW).toISOString();

  it("reads it only when the shipped read finds nothing, while its deadline runs or a timekeeper is seated", async () => {
    const { client, from, tkCalls } = mockClient({ rows: [] });
    await getMyActiveMatch(client, ME, NOW);
    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenNthCalledWith(2, "matches");
    expect(tkCalls).toEqual([
      ["select", "id, status, match_participants!inner(athlete_id, status)"],
      ["eq", "match_participants.athlete_id", ME],
      ["eq", "match_participants.status", "active"],
      ["is", "session_id", null],
      ["eq", "status", "pending"],
      ["eq", "requires_timekeeper", true],
      ["or", `timekeeper_deadline_at.gt.${nowIso},timekeeper_id.not.is.null`],
      ["order", "created_at", { ascending: false }],
      ["limit", 1],
    ]);
  });

  it("never runs when the shipped read found a match (the two-athlete path is one read, as before)", async () => {
    const { client, from, tkCalls } = mockClient({ rows: [{ id: "m1", status: "pending" }], details });
    await getMyActiveMatch(client, ME, NOW);
    expect(from).toHaveBeenCalledTimes(1);
    expect(tkCalls).toEqual([]);
  });

  it("returns that match, older than the 10-minute window, as pending with the opponent's name", async () => {
    const { client, rpc } = mockClient({ rows: [], tkRows: [{ id: "m-tk", status: "pending" }], details });
    expect(await getMyActiveMatch(client, ME, NOW)).toEqual({
      ok: true,
      data: { matchId: "m-tk", status: "pending", opponentName: "Demo Red" },
    });
    expect(rpc).toHaveBeenCalledWith("get_match_details", { p_match_id: "m-tk" });
  });

  it("leaves out matches the athlete backed out of", async () => {
    const { client, tkCalls } = mockClient({ rows: [] });
    await getMyActiveMatch(client, ME, NOW, [A, "not-a-uuid", B]);
    expect(tkCalls).toContainEqual(["not", "id", "in", `(${A},${B})`]);
  });

  it("sends no exclusion when nothing (valid) was left", async () => {
    const { client, tkCalls } = mockClient({ rows: [] });
    await getMyActiveMatch(client, ME, NOW, ["not-a-uuid"]);
    expect(tkCalls.some((c) => c[0] === "not")).toBe(false);
  });

  it("an older backend (no timekeeper columns) answers with an error: read as nothing more", async () => {
    const { client, rpc } = mockClient({
      rows: [],
      tkError: { message: "column matches.requires_timekeeper does not exist", code: "42703" },
    });
    expect(await getMyActiveMatch(client, ME, NOW)).toEqual({ ok: true, data: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns null when there is no timekeeper-mode pending match either", async () => {
    const { client } = mockClient({ rows: [], tkRows: [] });
    expect(await getMyActiveMatch(client, ME, NOW)).toEqual({ ok: true, data: null });
  });
});
