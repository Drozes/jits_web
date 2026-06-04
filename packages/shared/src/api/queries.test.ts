import { describe, it, expect } from "vitest";
import { getGymsWithSessions } from "./queries";

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
