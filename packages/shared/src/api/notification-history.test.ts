import { describe, it, expect } from "vitest";
import { getNotificationHistory, getNotificationHistoryResult } from "./queries";

// getNotificationHistory rows carry the challenge / match id they describe so
// each platform can route them to its own screens (jits-dq85.8), and no row
// carries the retired `/session/<id>` route any more (jits-r01i).

type Row = Record<string, unknown>;

function mockClient(received: Row[], sent: Row[], matches: Row[]) {
  let challengeReads = 0;
  function builder(data: Row[]) {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
    chain.then = (resolve: (v: { data: Row[] }) => unknown) => resolve({ data });
    return chain;
  }
  return {
    from(table: string) {
      if (table !== "challenges") throw new Error(`unexpected table ${table}`);
      // First read is received, second is sent (same order as the query).
      challengeReads += 1;
      return builder(challengeReads === 1 ? received : sent);
    },
    rpc(fn: string) {
      if (fn !== "get_match_history") throw new Error(`unexpected rpc ${fn}`);
      return Promise.resolve({ data: matches, error: null });
    },
  } as never;
}

const T = "2026-09-27T10:00:00Z";

describe("getNotificationHistory ids and routes", () => {
  it("tags challenge rows with challengeId and match rows with matchId, with no /session route", async () => {
    const items = await getNotificationHistory(
      mockClient(
        [
          { id: "c-pending", status: "pending", match_type: "ranked", created_at: T, updated_at: T, challenger: { display_name: "Alex" } },
          { id: "c-acc", status: "accepted", match_type: "casual", created_at: T, updated_at: T, challenger: { display_name: "Bo" } },
          { id: "c-dec", status: "declined", match_type: "casual", created_at: T, updated_at: T, challenger: { display_name: "Cy" } },
        ],
        [
          { id: "s-acc", status: "accepted", match_type: "ranked", created_at: T, updated_at: T, opponent: { display_name: "Di" } },
          { id: "s-dec", status: "declined", match_type: "ranked", created_at: T, updated_at: T, opponent: { display_name: "Ed" } },
        ],
        [
          {
            match_id: "m1",
            athlete_outcome: "win",
            elo_delta: 12,
            opponent_display_name: "Fay",
            completed_at: T,
          },
        ],
      ),
      "me",
    );

    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId["challenge-recv-c-pending"].challengeId).toBe("c-pending");
    expect(byId["challenge-accepted-c-acc"].challengeId).toBe("c-acc");
    expect(byId["challenge-declined-recv-c-dec"].challengeId).toBe("c-dec");
    expect(byId["challenge-sent-accepted-s-acc"].challengeId).toBe("s-acc");
    expect(byId["challenge-sent-declined-s-dec"].challengeId).toBe("s-dec");
    expect(byId["match-m1"].matchId).toBe("m1");
    expect(byId["match-m1"].type).toBe("match_result");
    for (const item of items) {
      expect("route" in item).toBe(false);
    }
  });
});

describe("getNotificationHistoryResult", () => {
  function client(opts: { challengeError?: boolean; rpcError?: boolean }) {
    function builder() {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve(opts.challengeError ? { data: null, error: { message: "x" } } : { data: [], error: null });
      return chain;
    }
    return {
      from: () => builder(),
      rpc: () =>
        Promise.resolve(opts.rpcError ? { data: null, error: { message: "x" } } : { data: [], error: null }),
    } as never;
  }

  it("is ok with an empty feed when every query succeeds", async () => {
    expect(await getNotificationHistoryResult(client({}), "me")).toEqual({ ok: true, items: [] });
  });

  it("reports a failed challenge query instead of an empty feed", async () => {
    expect(await getNotificationHistoryResult(client({ challengeError: true }), "me")).toEqual({ ok: false });
  });

  // Each challenge query in isolation: the first `from("challenges")` read is
  // received, the second is sent (same order as the query code). The error
  // cases still return rows, so the error check alone must catch them.
  type Resp = { data: Row[] | null; error: { message: string } | null };
  const OK: Resp = { data: [], error: null };
  function perCallClient(received: Resp, sent: Resp) {
    let reads = 0;
    function builder(resp: Resp) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => resolve(resp);
      return chain;
    }
    return {
      from: () => {
        reads += 1;
        return builder(reads === 1 ? received : sent);
      },
      rpc: () => Promise.resolve({ data: [], error: null }),
    } as never;
  }

  it("reports a failed sent-challenges query even when the received query succeeds", async () => {
    expect(
      await getNotificationHistoryResult(
        perCallClient(OK, { data: [], error: { message: "x" } }),
        "me",
      ),
    ).toEqual({ ok: false });
  });

  it("reports a failed received-challenges query even when the sent query succeeds", async () => {
    expect(
      await getNotificationHistoryResult(
        perCallClient({ data: [], error: { message: "x" } }, OK),
        "me",
      ),
    ).toEqual({ ok: false });
  });

  it("reports a sent-challenges query with no data and no error as failed", async () => {
    expect(
      await getNotificationHistoryResult(perCallClient(OK, { data: null, error: null }), "me"),
    ).toEqual({ ok: false });
  });

  it("reports a received-challenges query with no data and no error as failed", async () => {
    expect(
      await getNotificationHistoryResult(perCallClient({ data: null, error: null }, OK), "me"),
    ).toEqual({ ok: false });
  });

  it("reports a failed match-history RPC instead of an empty feed", async () => {
    expect(await getNotificationHistoryResult(client({ rpcError: true }), "me")).toEqual({ ok: false });
    // The plain variant keeps returning whatever rows it could read.
    expect(await getNotificationHistory(client({ rpcError: true }), "me")).toEqual([]);
  });
});
