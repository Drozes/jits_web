/**
 * Arena challenge reliability (jits-1o4l, jits-celf): the shared pieces.
 *
 * - `cancelChallenge` tells "withdrawn" apart from "was already over": RLS
 *   matches no row for an expired / declined / started challenge, and a
 *   no-row PostgREST update is not an error.
 * - `cancelStaleOutgoingChallenges` frees the 3-pending cap from the
 *   challenger's own challenges that outlived the live window, and never
 *   touches an `accepted` one (pending-guarded) or the one on screen.
 * - `createChallenge` hands back `expires_at` for the client-side expiry.
 */
import { describe, it, expect, vi } from "vitest";
import {
  cancelChallenge,
  cancelStaleOutgoingChallenges,
  createChallenge,
  isStaleOutgoingChallenge,
} from "./mutations";
import { ARENA_CHALLENGE_FRESH_MS } from "../constants";
import type { PendingChallenge } from "../types/composites";

/**
 * A `from("challenges").update(...)` chain that records every `.eq()` and
 * resolves `.select()` to the rows `rowsFor` returns for that challenge id,
 * so one client can answer a sweep over several rows.
 */
function mockUpdateClient(
  rowsFor: (id: string) => { data: unknown; error: unknown },
) {
  const eqs: Array<Array<[string, unknown]>> = [];
  const updates: unknown[] = [];
  const from = vi.fn(() => ({
    update: (values: unknown) => {
      updates.push(values);
      const calls: Array<[string, unknown]> = [];
      eqs.push(calls);
      const chain = {
        eq(col: string, val: unknown) {
          calls.push([col, val]);
          return chain;
        },
        select: () => {
          const id = calls.find(([c]) => c === "id")?.[1] as string;
          return Promise.resolve(rowsFor(id));
        },
      };
      return chain;
    },
  }));
  return { client: { from } as never, from, eqs, updates };
}

const NOW = Date.parse("2026-09-25T12:00:00Z");
const ME = "me-1";

function pending(
  id: string,
  ageMs: number,
  over: Partial<PendingChallenge> = {},
): PendingChallenge {
  return {
    challengeId: id,
    challengerId: ME,
    opponentId: "opp",
    challengerName: "Me",
    opponentName: "Opp",
    matchType: "ranked",
    createdAt: new Date(NOW - ageMs).toISOString(),
    expiresAt: new Date(NOW + 7 * 86_400_000).toISOString(),
    challengerWeight: null,
    opponentWeight: null,
    ...over,
  };
}

describe("cancelChallenge", () => {
  it("reports cancelled: true when a row actually changed", async () => {
    const { client, updates } = mockUpdateClient(() => ({
      data: [{ id: "c1" }],
      error: null,
    }));
    const result = await cancelChallenge(client, "c1");
    expect(updates[0]).toEqual({ status: "cancelled" });
    expect(result).toEqual({ ok: true, data: { cancelled: true } });
  });

  it("reports cancelled: false, not an error, when RLS matched no row (already expired)", async () => {
    const { client } = mockUpdateClient(() => ({ data: [], error: null }));
    const result = await cancelChallenge(client, "c1");
    expect(result).toEqual({ ok: true, data: { cancelled: false } });
  });

  it("only filters on pending when asked to", async () => {
    const { client, eqs } = mockUpdateClient(() => ({
      data: [{ id: "c1" }],
      error: null,
    }));
    await cancelChallenge(client, "c1");
    await cancelChallenge(client, "c1", { onlyIfPending: true });
    expect(eqs[0]).toEqual([["id", "c1"]]);
    expect(eqs[1]).toEqual([
      ["id", "c1"],
      ["status", "pending"],
    ]);
  });

  it("maps a transport error to a failed Result", async () => {
    const { client } = mockUpdateClient(() => ({
      data: null,
      error: { code: "XX000", message: "boom", details: "", hint: "" },
    }));
    const result = await cancelChallenge(client, "c1");
    expect(result.ok).toBe(false);
  });
});

describe("isStaleOutgoingChallenge", () => {
  it("is stale only past the Arena freshness window", () => {
    expect(
      isStaleOutgoingChallenge(pending("a", ARENA_CHALLENGE_FRESH_MS), NOW),
    ).toBe(false);
    expect(
      isStaleOutgoingChallenge(pending("a", ARENA_CHALLENGE_FRESH_MS + 1), NOW),
    ).toBe(true);
  });

  it("never calls an undatable challenge stale", () => {
    expect(isStaleOutgoingChallenge({ createdAt: "garbage" }, NOW)).toBe(false);
  });
});

describe("cancelStaleOutgoingChallenges", () => {
  it("withdraws only my own stale challenges, each guarded on pending", async () => {
    const { client, eqs } = mockUpdateClient((id) => ({
      data: [{ id }],
      error: null,
    }));
    const outgoing = [
      pending("fresh", 60_000),
      pending("stale-1", ARENA_CHALLENGE_FRESH_MS + 60_000),
      pending("stale-2", 3 * 86_400_000),
      pending("not-mine", 3 * 86_400_000, { challengerId: "someone-else" }),
    ];

    const result = await cancelStaleOutgoingChallenges(client, ME, {
      outgoing,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.cancelled.map((c) => c.challengeId)).toEqual([
        "stale-1",
        "stale-2",
      ]);
    }
    expect(eqs).toEqual([
      [
        ["id", "stale-1"],
        ["status", "pending"],
      ],
      [
        ["id", "stale-2"],
        ["status", "pending"],
      ],
    ]);
  });

  it("leaves the challenge the athlete is looking at alone", async () => {
    const { client, from } = mockUpdateClient((id) => ({
      data: [{ id }],
      error: null,
    }));

    const result = await cancelStaleOutgoingChallenges(client, ME, {
      outgoing: [pending("showing", 3 * 86_400_000)],
      now: NOW,
      keepChallengeId: "showing",
    });

    expect(result).toEqual({ ok: true, data: { cancelled: [] } });
    expect(from).not.toHaveBeenCalled();
  });

  it("does not count a challenge accepted in between as cancelled", async () => {
    // The pending guard matched no row: the opponent got there first.
    const { client } = mockUpdateClient((id) =>
      id === "raced"
        ? { data: [], error: null }
        : { data: [{ id }], error: null },
    );
    const result = await cancelStaleOutgoingChallenges(client, ME, {
      outgoing: [
        pending("raced", ARENA_CHALLENGE_FRESH_MS * 2),
        pending("gone", ARENA_CHALLENGE_FRESH_MS * 2),
      ],
      now: NOW,
    });
    expect(result.ok && result.data.cancelled.map((c) => c.challengeId)).toEqual(
      ["gone"],
    );
  });

  it("reads the pending list itself when not handed one, and surfaces a failed read", async () => {
    const order = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "down", details: "", hint: "" },
    });
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "eq", "gt", "or"]) chain[k] = () => chain;
    chain.order = order;
    const client = { from: vi.fn(() => chain) } as never;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await cancelStaleOutgoingChallenges(client, ME, { now: NOW });

    expect(result.ok).toBe(false);
    expect(order).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("createChallenge", () => {
  it("returns the row's expires_at so the challenger can expire it locally", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: "c1", expires_at: "2026-10-02T12:00:00Z" },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: ME, error: null }),
      from: vi.fn(() => ({ insert: () => ({ select }) })),
    } as never;

    const result = await createChallenge(client, {
      opponentId: "opp",
      matchType: "ranked",
    });

    expect(select).toHaveBeenCalledWith("id, expires_at");
    expect(result).toEqual({
      ok: true,
      data: { id: "c1", expiresAt: "2026-10-02T12:00:00Z" },
    });
  });
});
