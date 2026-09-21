import { describe, it, expect, vi } from "vitest";
import {
  getArenaData,
  getArenaDataResult,
  getGymDetail,
  getGymDetailResult,
  getGymsWithSessions,
  getGymsWithSessionsResult,
  getPendingChallengesForAthlete,
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

  /**
   * A FAILURE MUST NOT COST THE ATHLETE A LIVE SESSION.
   *
   * Nine of the ten reads succeed, including the session list, and the single
   * gym_managers .maybeSingle() fails. That says nothing whatsoever about which
   * sessions exist, so refusing the whole payload would hide a live session
   * behind an error plate: correct, but less available than the lenient
   * function this replaces, on the one surface the issue exists to fix.
   */
  it("hands back the session list on a capability failure, so a live session is not hidden", async () => {
    const queues = healthyDetailQueues();
    queues.gym_managers = [{ error: { code: "08006", message: "connection failure" } }];
    const { client } = fifoClient(queues);
    const result = await getGymDetailResult(client, "g1", "a1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.partial).not.toBeNull();
      expect(result.partial?.sessions).toHaveLength(1);
      expect(result.partial?.name).toBe("Test Gym");
    }
  });

  it("offers NO partial when the session list itself is untrustworthy", async () => {
    // The empty list here is an artefact of the failed read, not an answer, so
    // there is nothing safe to hand back and the caller must not render it.
    const queues = healthyDetailQueues();
    queues.sessions = [{ error: { code: "08006", message: "connection failure" } }];
    queues.session_participants = [];
    queues.session_rsvps = [];
    queues.athletes = [{ data: { primary_gym_id: "g1" } }, { count: 12 }];
    const { client } = fifoClient(queues);
    const result = await getGymDetailResult(client, "g1", "a1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.partial).toBeNull();
  });

  it("offers no partial when the gym row itself could not be read", async () => {
    const { client } = fifoClient({
      gyms: [{ error: { code: "08006", message: "connection failure" } }],
    });
    const result = await getGymDetailResult(client, "g1", "a1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.partial).toBeNull();
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

// ---------------------------------------------------------------------------
// getArenaDataResult (Task 1): the arena read gets a failure signal, and the
// lenient getArenaData keeps its exact old behaviour because mobile's
// use-arena-roster.ts derives "failed read" from the null it returns.
//
// Every failure here is a RESOLVED { data: null, error }, never a rejection,
// for the reason documented at the top of this file.
// ---------------------------------------------------------------------------

const ARENA_PAYLOAD = {
  looking_athletes: [
    {
      id: "a1",
      display_name: "Rival",
      current_elo: 1200,
      gym_name: "Test Gym",
      looking_for_casual: true,
      looking_for_ranked: true,
      profile_photo_url: null,
      current_weight: 170,
    },
  ],
  other_athletes: [],
  challenged_opponent_ids: ["a9"],
  recent_activity: [],
};

/** Silences the console.error both arena wrappers emit on a failed read. */
function silenceErrors() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("getArenaDataResult", () => {
  it("reports success and hands back the payload on a healthy read", async () => {
    const { client, reads } = fifoClient({}, { get_arena_data: { data: ARENA_PAYLOAD } });
    const result = await getArenaDataResult(client, 100);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.looking_athletes).toHaveLength(1);
      expect(result.data.challenged_opponent_ids).toEqual(["a9"]);
    }
    expect(reads).toContain("rpc:get_arena_data");
  });

  it("reports success with an empty roster, which is a fact the page may state", async () => {
    const { client } = fifoClient(
      {},
      { get_arena_data: { data: { ...ARENA_PAYLOAD, looking_athletes: [] } } },
    );
    const result = await getArenaDataResult(client, 100);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.looking_athletes).toEqual([]);
  });

  /**
   * THE CRASH THIS TASK EXISTS TO CLOSE. The old getArenaData logged the error
   * and returned `data`, which is null on failure, and web /arena then called
   * `.map()` on `arena.looking_athletes` — a TypeError on a primary nav tab.
   */
  it("reports failure, rather than a null payload, when the RPC fails", async () => {
    const spy = silenceErrors();
    const { client } = fifoClient(
      {},
      { get_arena_data: { error: { code: "08006", message: "connection failure" } } },
    );
    const result = await getArenaDataResult(client, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNKNOWN");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  /**
   * get_arena_data RAISEs when auth_athlete_id() resolves to nothing, so the
   * reachable failure on this surface is a P0001, not a network drop. With the
   * athlete_not_found hint it maps to a specific code the caller could act on.
   */
  it("maps the RPC's athlete_not_found RAISE to ATHLETE_NOT_FOUND", async () => {
    const spy = silenceErrors();
    const { client } = fifoClient(
      {},
      {
        get_arena_data: {
          error: {
            code: "P0001",
            message: "Athlete not found",
            hint: "athlete_not_found",
          },
        },
      },
    );
    const result = await getArenaDataResult(client, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ATHLETE_NOT_FOUND");
    spy.mockRestore();
  });

  it("reports failure when the RPC answers with no error and no data", async () => {
    const { client } = fifoClient({}, { get_arena_data: { data: null } });
    const result = await getArenaDataResult(client, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNKNOWN");
  });

  it("reports failure when the payload is shaped wrong, rather than passing a crash on", async () => {
    // No looking_athletes key at all. The caller's very next statement is
    // .map() on it, so "shaped wrong" and "did not load" are the same event as
    // far as the surface is concerned.
    const { client } = fifoClient(
      {},
      { get_arena_data: { data: { challenged_opponent_ids: [] } } },
    );
    const result = await getArenaDataResult(client, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNKNOWN");
  });

  /**
   * BACKWARD COMPATIBILITY GUARD, AND IT IS LOAD-BEARING.
   * apps/mobile/lib/arena/use-arena-roster.ts re-widens this to
   * `ArenaData | null` and treats null as "failed read, do not claim the lobby
   * is empty". Returning [] or throwing here would delete mobile's only
   * failure signal.
   */
  it("leaves the legacy getArenaData resolving to null on the same failure", async () => {
    const spy = silenceErrors();
    const { client } = fifoClient(
      {},
      { get_arena_data: { error: { code: "08006", message: "connection failure" } } },
    );
    const arena = await getArenaData(client, 100);
    expect(arena).toBeNull();
    spy.mockRestore();
  });

  it("leaves the legacy getArenaData returning the payload on a healthy read", async () => {
    const { client } = fifoClient({}, { get_arena_data: { data: ARENA_PAYLOAD } });
    const arena = await getArenaData(client, 100);
    expect(arena.looking_athletes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getPendingChallengesForAthlete (Task 4): the challenge inbox/outbox read
// that web and mobile will both consume.
// ---------------------------------------------------------------------------

/**
 * A challenges-table mock that RECORDS the builder calls, so the tests can
 * assert the server-side filters and not just the mapping. The status and
 * expiry filters are the difference between an inbox and a list of rows the
 * athlete can no longer act on, and they are invisible to a mock that only
 * returns canned data.
 */
function challengeClient(resp: Resp) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt", "or", "order"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return chain;
    };
  }
  chain.then = (resolve: (value: Resp) => unknown) =>
    resolve({ data: resp.data ?? null, error: resp.error ?? null });

  const client = {
    from(table: string) {
      if (table !== "challenges") throw new Error(`unexpected table ${table}`);
      calls.push({ method: "from", args: [table] });
      return chain;
    },
  } as never;
  return { client, calls };
}

const ME = "athlete-me";

const INCOMING_ROW = {
  id: "c-in",
  challenger_id: "athlete-rival",
  opponent_id: ME,
  match_type: "ranked",
  created_at: "2026-09-20T10:00:00.000Z",
  expires_at: "2026-09-22T10:00:00.000Z",
  challenger_weight: 170,
  opponent_weight: null,
  challenger: { display_name: "Rival" },
  opponent: { display_name: "Me" },
};

const OUTGOING_ROW = {
  id: "c-out",
  challenger_id: ME,
  opponent_id: "athlete-target",
  match_type: "casual",
  created_at: "2026-09-19T10:00:00.000Z",
  expires_at: "2026-09-21T10:00:00.000Z",
  challenger_weight: null,
  opponent_weight: 185,
  challenger: { display_name: "Me" },
  opponent: { display_name: "Target" },
};

describe("getPendingChallengesForAthlete", () => {
  it("splits rows by the athlete's role on the row", async () => {
    const { client } = challengeClient({ data: [INCOMING_ROW, OUTGOING_ROW] });
    const result = await getPendingChallengesForAthlete(client, ME);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.incoming.map((c) => c.challengeId)).toEqual(["c-in"]);
    expect(result.data.outgoing.map((c) => c.challengeId)).toEqual(["c-out"]);

    const incoming = result.data.incoming[0];
    expect(incoming).toEqual({
      challengeId: "c-in",
      challengerId: "athlete-rival",
      opponentId: ME,
      challengerName: "Rival",
      opponentName: "Me",
      matchType: "ranked",
      createdAt: "2026-09-20T10:00:00.000Z",
      expiresAt: "2026-09-22T10:00:00.000Z",
      challengerWeight: 170,
      opponentWeight: null,
    });
  });

  it("applies the pending + not-expired + either-direction filters server side", async () => {
    const { client, calls } = challengeClient({ data: [] });
    await getPendingChallengesForAthlete(client, ME);

    const eq = calls.find((c) => c.method === "eq");
    expect(eq?.args).toEqual(["status", "pending"]);

    // A lapsed challenge sits at 'pending' until a BE sweep updates it, so
    // status alone would show an inbox row the athlete can no longer accept.
    const gt = calls.find((c) => c.method === "gt");
    expect(gt?.args[0]).toBe("expires_at");
    expect(typeof gt?.args[1]).toBe("string");
    expect(Number.isNaN(Date.parse(gt?.args[1] as string))).toBe(false);

    const or = calls.find((c) => c.method === "or");
    expect(or?.args[0]).toBe(
      `challenger_id.eq.${ME},opponent_id.eq.${ME}`,
    );
  });

  it("resolves display names when the aliased embed arrives widened to an array", async () => {
    // Aliased FK joins return a single object, but the generated types have
    // been known to widen a to-one embed to an array; the name must survive
    // either shape rather than silently becoming "Unknown".
    const { client } = challengeClient({
      data: [
        {
          ...INCOMING_ROW,
          challenger: [{ display_name: "Rival" }],
          opponent: [{ display_name: "Me" }],
        },
      ],
    });
    const result = await getPendingChallengesForAthlete(client, ME);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.incoming[0].challengerName).toBe("Rival");
      expect(result.data.incoming[0].opponentName).toBe("Me");
    }
  });

  it("falls back to Unknown when RLS hides the embedded athlete row", async () => {
    const { client } = challengeClient({
      data: [{ ...INCOMING_ROW, challenger: null, opponent: null }],
    });
    const result = await getPendingChallengesForAthlete(client, ME);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.incoming[0].challengerName).toBe("Unknown");
      expect(result.data.incoming[0].opponentName).toBe("Unknown");
    }
  });

  it("reports success with empty buckets when there are no live challenges", async () => {
    // A real answer, and the caller is allowed to state it.
    const { client } = challengeClient({ data: [] });
    const result = await getPendingChallengesForAthlete(client, ME);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ incoming: [], outgoing: [] });
  });

  it("reports failure, not an empty inbox, when the read fails", async () => {
    const spy = silenceErrors();
    const { client } = challengeClient({
      error: { code: "08006", message: "connection failure" },
    });
    const result = await getPendingChallengesForAthlete(client, ME);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNKNOWN");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("maps an RLS denial to RLS_VIOLATION rather than to a challenge-quota error", async () => {
    // 42501 means MAX_PENDING_CHALLENGES only in the challenge_create context;
    // on a read it is a plain policy denial and must not be relabelled.
    const spy = silenceErrors();
    const { client } = challengeClient({
      error: { code: "42501", message: "permission denied" },
    });
    const result = await getPendingChallengesForAthlete(client, ME);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RLS_VIOLATION");
    spy.mockRestore();
  });

  it("ignores a row the athlete is not a party to instead of guessing a direction", async () => {
    // RLS (challenges_select_own) makes this unreachable in production, but a
    // row that belongs to neither bucket must be dropped, never defaulted into
    // one: an outbox entry the athlete never sent would be worse than a gap.
    const { client } = challengeClient({
      data: [
        { ...INCOMING_ROW, id: "c-other", challenger_id: "x", opponent_id: "y" },
      ],
    });
    const result = await getPendingChallengesForAthlete(client, ME);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ incoming: [], outgoing: [] });
  });
});
