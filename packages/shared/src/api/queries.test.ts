import { describe, it, expect, vi } from "vitest";
import {
  getGymDetail,
  getGymDetailResult,
  getGymsWithSessions,
  getGymsWithSessionsResult,
} from "./queries";

// ---------------------------------------------------------------------------
// getGymsWithSessions — live/joinable parity with getGymDetail
//
// Both queries must agree on what counts as a live session:
//   status === 'active' AND scheduled_end > now.
// An 'active' session whose scheduled_end is already in the past must NOT mark
// its gym as LIVE on the list (otherwise the list shows LIVE while the detail
// shows "No Sessions Scheduled" — a dead end). jits-3ie.2.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/**
 * Minimal Supabase client mock for getGymsWithSessions. The function issues
 * three independent reads (gyms / athletes / sessions) in a Promise.all; this
 * mock returns canned data keyed by the table name and makes every chained
 * builder method (select/eq/in/not/order) thenable so `await`-ing the builder
 * resolves to `{ data }`.
 */
function mockClient(tables: {
  gyms: Row[];
  athletes: Row[];
  sessions: Row[];
  memberCounts?: Row[];
}) {
  function builder(data: Row[]) {
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ["select", "eq", "in", "not", "order"]) {
      chain[m] = passthrough;
    }
    // Make the builder awaitable: `await chain` -> { data }.
    chain.then = (
      resolve: (value: { data: Row[] }) => unknown,
    ) => resolve({ data });
    return chain;
  }

  return {
    from(table: string) {
      if (table === "gyms") return builder(tables.gyms);
      if (table === "athletes") return builder(tables.athletes);
      if (table === "sessions") return builder(tables.sessions);
      throw new Error(`unexpected table ${table}`);
    },
    // Member counts are aggregated server side now (jits-icei.2), so the client
    // needs an rpc stub as well as tables.
    rpc(fn: string) {
      if (fn === "get_gym_member_counts") {
        return Promise.resolve({ data: tables.memberCounts ?? [], error: null });
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  } as never;
}

const HOUR = 60 * 60 * 1000;
const future = () => new Date(Date.now() + HOUR).toISOString();
const past = () => new Date(Date.now() - HOUR).toISOString();

describe("getGymsWithSessions live/joinable rule (jits-3ie.2)", () => {
  it("does NOT mark a gym LIVE when its only active session has a past scheduled_end", async () => {
    const client = mockClient({
      gyms: [{ id: "g1", name: "Past Gym", city: "X", status: "active" }],
      athletes: [],
      sessions: [
        {
          id: "s1",
          gym_id: "g1",
          status: "active",
          scheduled_start: past(),
          scheduled_end: past(), // already over
        },
      ],
    });

    const [gym] = await getGymsWithSessions(client);
    expect(gym.hasActiveSession).toBe(false);
    expect(gym.activeSessions).toBe(0);
  });

  it("marks a gym LIVE when an active session ends in the future", async () => {
    const client = mockClient({
      gyms: [{ id: "g2", name: "Live Gym", city: "X", status: "active" }],
      athletes: [],
      sessions: [
        {
          id: "s2",
          gym_id: "g2",
          status: "active",
          scheduled_start: past(),
          scheduled_end: future(), // still running
        },
      ],
    });

    const [gym] = await getGymsWithSessions(client);
    expect(gym.hasActiveSession).toBe(true);
    expect(gym.activeSessions).toBe(1);
  });

  it("counts only future-ending active sessions when a gym has both", async () => {
    const client = mockClient({
      gyms: [{ id: "g3", name: "Mixed Gym", city: "X", status: "active" }],
      athletes: [],
      sessions: [
        {
          id: "s3a",
          gym_id: "g3",
          status: "active",
          scheduled_start: past(),
          scheduled_end: past(),
        },
        {
          id: "s3b",
          gym_id: "g3",
          status: "active",
          scheduled_start: past(),
          scheduled_end: future(),
        },
      ],
    });

    const [gym] = await getGymsWithSessions(client);
    expect(gym.hasActiveSession).toBe(true);
    expect(gym.activeSessions).toBe(1);
  });

  it("still counts future scheduled sessions as upcoming (unchanged behavior)", async () => {
    const client = mockClient({
      gyms: [{ id: "g4", name: "Upcoming Gym", city: "X", status: "active" }],
      athletes: [],
      sessions: [
        {
          id: "s4",
          gym_id: "g4",
          status: "scheduled",
          scheduled_start: future(),
          scheduled_end: future(),
        },
      ],
    });

    const [gym] = await getGymsWithSessions(client);
    expect(gym.hasActiveSession).toBe(false);
    expect(gym.upcomingSessions).toBe(1);
    expect(gym.nextSessionStart).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Discovery reads: explicit failure signal (jits-icei.5) and the bounded
// member-count aggregate (jits-icei.2).
//
// EVERY FAILURE BELOW IS A RESOLVED VALUE, NEVER A REJECTION. supabase-js does
// not reject: postgrest-js sets shouldThrowOnError = false (PostgrestBuilder.ts
// :82) and its outer handler converts even a hard network failure into a
// resolved { data: null, error }. A test built on mockRejectedValue would
// certify a path production cannot produce, so none of these use one.
// ---------------------------------------------------------------------------

interface Resp {
  data?: unknown;
  error?: unknown;
  count?: number;
}

/**
 * A Supabase client mock that answers each `from(table)` call with the next
 * queued response for that table, in call order.
 *
 * getGymDetail reads some tables more than once (athletes three times,
 * session_participants and session_rsvps twice each) and issues them in a fixed
 * order, so a per-table FIFO is enough to script exactly one read failing while
 * the rest succeed. That mid-sequence shape is the whole point of the issue:
 * the first read succeeding and a later one failing is what used to come back
 * as a perfectly ordinary gym with no sessions.
 */
function fifoClient(queues: Record<string, Resp[]>, rpc: Record<string, Resp> = {}) {
  const reads: string[] = [];
  function builder(resp: Resp) {
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of [
      "select",
      "eq",
      "in",
      "not",
      "gt",
      "order",
      "limit",
      "neq",
      "single",
      "maybeSingle",
    ]) {
      chain[m] = passthrough;
    }
    chain.then = (resolve: (value: Resp) => unknown) =>
      resolve({
        data: resp.data ?? null,
        error: resp.error ?? null,
        count: resp.count ?? undefined,
      });
    return chain;
  }
  const client = {
    from(table: string) {
      reads.push(table);
      const queue = queues[table];
      if (!queue || queue.length === 0) {
        throw new Error(`unexpected read of ${table}`);
      }
      return builder(queue.shift() as Resp);
    },
    rpc(fn: string) {
      reads.push(`rpc:${fn}`);
      const resp = rpc[fn];
      if (!resp) throw new Error(`unexpected rpc ${fn}`);
      return Promise.resolve({ data: resp.data ?? null, error: resp.error ?? null });
    },
  } as never;
  return { client, reads };
}

const GYM_ROW = { id: "g1", name: "Test Gym", city: "Austin", status: "active" };
const SESSION_ROW = {
  id: "s1",
  title: "Open Mat",
  scheduled_start: future(),
  scheduled_end: future(),
  status: "active",
  max_participants: null,
  created_by: "a2",
};

/** Queues for a fully healthy getGymDetail read with one session. */
function healthyDetailQueues(): Record<string, Resp[]> {
  return {
    gyms: [{ data: GYM_ROW }],
    sessions: [{ data: [SESSION_ROW] }],
    session_participants: [{ data: [{ session_id: "s1" }] }, { data: [] }],
    session_rsvps: [{ data: [{ session_id: "s1" }] }, { data: [] }],
    athletes: [
      { data: [{ id: "a2", display_name: "Coach" }] },
      { data: { primary_gym_id: "g1" } },
      { count: 12 },
    ],
    gym_managers: [{ data: null }],
  };
}

describe("getGymsWithSessions member counts (jits-icei.2)", () => {
  it("builds member counts from the get_gym_member_counts RPC", async () => {
    const client = mockClient({
      gyms: [{ id: "g1", name: "Gym One", city: "X", status: "active" }],
      athletes: [],
      sessions: [],
      memberCounts: [{ gym_id: "g1", member_count: 7 }],
    });
    const [gym] = await getGymsWithSessions(client);
    expect(gym.memberCount).toBe(7);
  });

  /**
   * The defect this replaces: an unbounded SELECT primary_gym_id over every
   * active athlete, shipped to the device purely to be grouped client side. It
   * now runs on the Home landing screen and on web /gyms, so the guard is that
   * the athletes table is not read here AT ALL.
   */
  it("never reads the athletes table to count members", async () => {
    const { client, reads } = fifoClient(
      {
        gyms: [{ data: [{ id: "g1", name: "Gym One", city: "X", status: "active" }] }],
        sessions: [{ data: [] }],
      },
      { get_gym_member_counts: { data: [{ gym_id: "g1", member_count: 4 }] } },
    );
    const gyms = await getGymsWithSessions(client);
    expect(gyms[0].memberCount).toBe(4);
    expect(reads).toContain("rpc:get_gym_member_counts");
    expect(reads).not.toContain("athletes");
  });

  it("still returns the gyms, with zero counts, when the count RPC is unavailable", async () => {
    // The RPC ships in a separate repo's migration, so a frontend that reaches
    // production first gets PGRST202 here. That must not blank a list of live
    // gyms over a decorative number.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fifoClient(
      {
        gyms: [{ data: [{ id: "g1", name: "Gym One", city: "X", status: "active" }] }],
        sessions: [{ data: [] }],
      },
      { get_gym_member_counts: { error: { code: "PGRST202", message: "not found" } } },
    );
    const result = await getGymsWithSessionsResult(client);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].memberCount).toBe(0);
    }
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("getGymsWithSessionsResult (jits-icei.5)", () => {
  it("reports failure when the gyms read fails", async () => {
    const { client } = fifoClient(
      {
        gyms: [{ error: { code: "08006", message: "connection failure" } }],
        sessions: [{ data: [] }],
      },
      { get_gym_member_counts: { data: [] } },
    );
    const result = await getGymsWithSessionsResult(client);
    expect(result.ok).toBe(false);
  });

  it("reports failure when the SESSIONS read fails, rather than a list of dark gyms", async () => {
    const { client } = fifoClient(
      {
        gyms: [{ data: [{ id: "g1", name: "Gym One", city: "X", status: "active" }] }],
        sessions: [{ error: { code: "08006", message: "connection failure" } }],
      },
      { get_gym_member_counts: { data: [] } },
    );
    const result = await getGymsWithSessionsResult(client);
    expect(result.ok).toBe(false);
  });

  it("reports success with an empty list when no gym has a session", async () => {
    // An empty result is a fact about the world, not a failure, and the caller
    // is allowed to state it.
    const { client } = fifoClient(
      {
        gyms: [{ data: [{ id: "g1", name: "Gym One", city: "X", status: "active" }] }],
        sessions: [{ data: [] }],
      },
      { get_gym_member_counts: { data: [] } },
    );
    const result = await getGymsWithSessionsResult(client);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0].hasActiveSession).toBe(false);
  });

  it("leaves the legacy getGymsWithSessions lenient on the same failure", async () => {
    // Backward compatibility guard. Web /gyms renders whatever this returns and
    // has never been told about failure; tightening it would empty that page on
    // a dropped request.
    const { client } = fifoClient(
      {
        gyms: [{ data: [{ id: "g1", name: "Gym One", city: "X", status: "active" }] }],
        sessions: [{ error: { code: "08006", message: "connection failure" } }],
      },
      { get_gym_member_counts: { data: [] } },
    );
    const gyms = await getGymsWithSessions(client);
    expect(gyms).toHaveLength(1);
    expect(gyms[0].hasActiveSession).toBe(false);
  });
});

describe("getGymDetailResult (jits-icei.5)", () => {
  it("reports success, with the sessions, on a healthy read", async () => {
    const { client } = fifoClient(healthyDetailQueues());
    const result = await getGymDetailResult(client, "g1", "a1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.sessions).toHaveLength(1);
      expect(result.data.memberCount).toBe(12);
      expect(result.data.isMemberGym).toBe(true);
    }
  });

  it("reports failure when the gym row read fails", async () => {
    const { client } = fifoClient({
      gyms: [{ error: { code: "08006", message: "connection failure" } }],
    });
    const result = await getGymDetailResult(client, "g1", "a1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNKNOWN");
  });

  it("separates a gym that does not exist from a read that failed", async () => {
    // `.single()` reports "no rows" as PGRST116, so the two arrive through the
    // same channel and have to be told apart by code.
    const { client } = fifoClient({
      gyms: [{ error: { code: "PGRST116", message: "0 rows" } }],
    });
    const result = await getGymDetailResult(client, "g1", "a1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("GYM_NOT_FOUND");
  });

  /**
   * THE HOLE THIS ISSUE EXISTS TO CLOSE.
   *
   * The gym row reads fine and the sessions read then fails. The old code
   * discarded that error, coalesced sessions to [], and returned a perfectly
   * truthy GymDetail, so Home said "Nothing scheduled at <gym> right now" on a
   * dropped request. Nothing about the payload gave the caller a way to tell.
   */
  it("reports failure when the gym row loads and the SESSIONS read then fails", async () => {
    const queues = healthyDetailQueues();
    queues.sessions = [{ error: { code: "08006", message: "connection failure" } }];
    // With no session ids, the five enrichment reads are skipped entirely.
    queues.session_participants = [];
    queues.session_rsvps = [];
    queues.athletes = [{ data: { primary_gym_id: "g1" } }, { count: 12 }];
    const { client } = fifoClient(queues);
    const result = await getGymDetailResult(client, "g1", "a1");
    expect(result.ok).toBe(false);
  });

  it("reports failure when the manager check fails, rather than silently demoting a manager", async () => {
    const queues = healthyDetailQueues();
    queues.gym_managers = [{ error: { code: "08006", message: "connection failure" } }];
    const { client } = fifoClient(queues);
    const result = await getGymDetailResult(client, "g1", "a1");
    expect(result.ok).toBe(false);
  });

  it("still succeeds, and logs, when only a decorative read fails", async () => {
    // Participant counts are a subtitle. Promoting them to fatal would hide a
    // LIVE session behind an error plate, which is the same harm by another
    // route, so they degrade to zero and say so in the log instead.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const queues = healthyDetailQueues();
    queues.session_participants = [
      { error: { code: "08006", message: "connection failure" } },
      { data: [] },
    ];
    const { client } = fifoClient(queues);
    const result = await getGymDetailResult(client, "g1", "a1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.sessions).toHaveLength(1);
      expect(result.data.sessions[0].participantCount).toBe(0);
    }
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("leaves the legacy getGymDetail lenient on a mid-sequence failure", async () => {
    // Backward compatibility guard. Web's three call sites turn null into
    // notFound(), so returning null here would convert a dropped sessions read
    // into a 404 on a page that used to render.
    const queues = healthyDetailQueues();
    queues.sessions = [{ error: { code: "08006", message: "connection failure" } }];
    queues.session_participants = [];
    queues.session_rsvps = [];
    queues.athletes = [{ data: { primary_gym_id: "g1" } }, { count: 12 }];
    const { client } = fifoClient(queues);
    const detail = await getGymDetail(client, "g1", "a1");
    expect(detail).not.toBeNull();
    expect(detail?.sessions).toEqual([]);
    expect(detail?.name).toBe("Test Gym");
  });
});
