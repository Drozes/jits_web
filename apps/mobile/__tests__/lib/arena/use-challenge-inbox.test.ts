/**
 * Home's challenge inbox.
 *
 * The bug this surface closes: the Arena prompt raises purely off a
 * `postgres_changes` INSERT with no backfill, so a challenge that arrived
 * while the recipient was anywhere else in the app was unreachable until it
 * expired. So the load-bearing assertions here are (a) that a backfill read
 * actually happens, (b) that accepting from Home performs the SAME handshake
 * the Arena does, broadcast included, and (c) that a row the athlete can no
 * longer act on is never left on screen offering an action.
 *
 * The real `challenge-handshake` module is used deliberately, not a mock: the
 * point of the extraction is that Home cannot accept without broadcasting, and
 * mocking the module out would let that regress unnoticed.
 *
 * Failure is always driven from RESOLVED values. supabase-js does not reject
 * (postgrest-js sets shouldThrowOnError = false and turns even a hard fetch
 * error into a resolved `{ data: null, error }`), the shared queries and
 * mutations return `Result`, and `channel.send()` resolves to a status string.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { challengeInboxTopic, incomingTopic } from "@/lib/arena/constants";

// ---- mocks ----

const mockCalls: string[] = [];

interface Binding {
  topic: string;
  type: string;
  filter: Record<string, string>;
  handler: (payload: unknown) => void | Promise<void>;
}

const mockBindings: Binding[] = [];
const mockChannelTopics: string[] = [];
const mockSend = jest.fn();
const mockRemoveChannel = jest.fn();

function mockMakeChannel(topic: string) {
  const channel = {
    topic,
    on(type: string, filter: Record<string, string>, handler: Binding["handler"]) {
      mockBindings.push({ topic, type, filter, handler });
      return channel;
    },
    subscribe() {
      return channel;
    },
    send(msg: { event: string }) {
      mockCalls.push(`send:${msg.event}`);
      return mockSend(msg);
    },
  };
  return channel;
}

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: (topic: string) => {
      mockChannelTopics.push(topic);
      return mockMakeChannel(topic);
    },
    removeChannel: (...a: unknown[]) => mockRemoveChannel(...a),
  },
}));

const mockGetPending = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getPendingChallengesForAthlete: (...a: unknown[]) => {
    mockCalls.push("read");
    return mockGetPending(...a);
  },
}));

const mockAcceptChallenge = jest.fn();
const mockDeclineChallenge = jest.fn();
const mockCancelChallenge = jest.fn();
const mockStartMatch = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  acceptChallenge: (...a: unknown[]) => {
    mockCalls.push("accept");
    return mockAcceptChallenge(...a);
  },
  declineChallenge: (...a: unknown[]) => {
    mockCalls.push("decline");
    return mockDeclineChallenge(...a);
  },
  cancelChallenge: (...a: unknown[]) => {
    mockCalls.push("cancel");
    return mockCancelChallenge(...a);
  },
  startMatchFromChallenge: (...a: unknown[]) => {
    mockCalls.push("start");
    return mockStartMatch(...a);
  },
}));

const mockPush = jest.fn((href: string) => {
  mockCalls.push(`push:${href}`);
});
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const mockToastError = jest.fn();
const mockToastInfo = jest.fn();
jest.mock("@/components/ui/toast", () => ({
  toast: {
    error: (...a: unknown[]) => mockToastError(...a),
    info: (...a: unknown[]) => mockToastInfo(...a),
    success: jest.fn(),
  },
}));

import { useChallengeInbox } from "@/lib/arena/use-challenge-inbox";

// ---- fixtures ----

const ME = "me-1";
const RIVAL = "opp-1";
const IN_ID = "ch-in";
const OUT_ID = "ch-out";
const MATCH = "match-1";

/** Far enough out that the expiry timer is never armed by accident. */
const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString();

function challenge(over: Record<string, unknown> = {}) {
  return {
    challengeId: IN_ID,
    challengerId: RIVAL,
    opponentId: ME,
    challengerName: "Rival",
    opponentName: "Me",
    matchType: "ranked",
    createdAt: new Date().toISOString(),
    expiresAt: inDays(6),
    challengerWeight: 190,
    opponentWeight: null,
    ...over,
  };
}

const INCOMING = challenge();
const OUTGOING = challenge({
  challengeId: OUT_ID,
  challengerId: ME,
  opponentId: RIVAL,
  challengerName: "Me",
  opponentName: "Rival",
});

function mount(athleteId: string | undefined = ME, weight: number | null = 180) {
  return renderHook(() => useChallengeInbox(athleteId, weight));
}

async function mountLoaded(weight: number | null = 180) {
  const hook = mount(ME, weight);
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

function findBinding(
  event: string,
  column: "opponent_id" | "challenger_id",
): Binding {
  const found = mockBindings.find(
    (b) =>
      b.type === "postgres_changes" &&
      b.filter.event === event &&
      b.filter.filter === `${column}=eq.${ME}`,
  );
  if (!found) throw new Error(`no ${event} binding on ${column}`);
  return found;
}

beforeEach(() => {
  mockCalls.length = 0;
  mockBindings.length = 0;
  mockChannelTopics.length = 0;
  jest.clearAllMocks();
  mockSend.mockResolvedValue("ok");
  mockGetPending.mockResolvedValue({
    ok: true,
    data: { incoming: [INCOMING], outgoing: [OUTGOING] },
  });
  mockAcceptChallenge.mockResolvedValue({ ok: true, data: undefined });
  mockDeclineChallenge.mockResolvedValue({ ok: true, data: undefined });
  mockCancelChallenge.mockResolvedValue({ ok: true, data: undefined });
  mockStartMatch.mockResolvedValue({
    ok: true,
    data: { success: true, match_id: MATCH, challenge_id: IN_ID },
  });
});

// ---------------------------------------------------------------------------

describe("backfill", () => {
  it("reads the pending challenges at mount and splits them by direction", async () => {
    // THE WHOLE POINT. The Arena never did this, which is why a challenge sent
    // while the recipient was elsewhere was invisible until it expired.
    const { result } = await mountLoaded();

    expect(mockGetPending).toHaveBeenCalledWith(expect.anything(), ME);
    expect(result.current.incoming.map((c) => c.challengeId)).toEqual([IN_ID]);
    expect(result.current.outgoing.map((c) => c.challengeId)).toEqual([OUT_ID]);
    expect(result.current.loadFailed).toBe(false);
  });

  it("does not read or subscribe without an athlete", async () => {
    const { result } = mount(undefined);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetPending).not.toHaveBeenCalled();
    expect(mockChannelTopics).toHaveLength(0);
  });

  it("reports a failed read instead of claiming there is nothing waiting", async () => {
    // An empty list and a failed read look identical downstream, and this is
    // the one surface where "nothing is waiting on you" must not be guessed.
    mockGetPending.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "connection failure" },
    });
    const { result } = await mountLoaded();

    expect(result.current.loadFailed).toBe(true);
    expect(result.current.incoming).toHaveLength(0);
  });

  it("clears the failure flag once a later read succeeds", async () => {
    mockGetPending.mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN", message: "connection failure" },
    });
    const { result } = await mountLoaded();
    expect(result.current.loadFailed).toBe(true);

    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.loadFailed).toBe(false));
    expect(result.current.incoming).toHaveLength(1);
  });
});

describe("expiry", () => {
  /**
   * jr_be's `expire-pending-challenges` pg_cron job runs `*/​15 * * * *`, so a
   * challenge can be past `expires_at` and still read `status = 'pending'` for
   * up to fifteen minutes. The query filters `expires_at > now()` server-side;
   * this is the client half of the same guard, for a row that lapses after it
   * has already been handed over.
   */
  it("hides a row that is already past its expiry when the read returns it", async () => {
    mockGetPending.mockResolvedValue({
      ok: true,
      data: {
        incoming: [
          challenge({ expiresAt: new Date(Date.now() - 1_000).toISOString() }),
        ],
        outgoing: [],
      },
    });
    const { result } = await mountLoaded();

    expect(result.current.incoming).toHaveLength(0);
  });

  it("drops a row the moment it lapses on screen, with no refresh", async () => {
    mockGetPending.mockResolvedValue({
      ok: true,
      data: {
        incoming: [
          challenge({ expiresAt: new Date(Date.now() + 200).toISOString() }),
        ],
        outgoing: [],
      },
    });
    const { result } = await mountLoaded();
    expect(result.current.incoming).toHaveLength(1);

    // An Accept button that fails on tap is worse than no row at all.
    await waitFor(() => expect(result.current.incoming).toHaveLength(0), {
      timeout: 3000,
    });
    expect(mockGetPending).toHaveBeenCalledTimes(1);
  });
});

describe("accepting from Home", () => {
  it("runs the full handshake and broadcasts BEFORE navigating", async () => {
    const { result } = await mountLoaded();
    mockCalls.length = 0;

    await act(async () => {
      await result.current.accept(IN_ID);
    });

    // Identical to the Arena's ordering, because it is literally the same
    // code. Navigate first and the challenger sits on the waiting plate while
    // this athlete is already in the wizard.
    expect(mockCalls).toEqual([
      "accept",
      "start",
      "send:match_started",
      `push:/match/${MATCH}`,
    ]);
    expect(mockAcceptChallenge).toHaveBeenCalledWith(expect.anything(), {
      challengeId: IN_ID,
      opponentWeight: 180,
    });
  });

  it("removes the accepted row from the inbox", async () => {
    const { result } = await mountLoaded();

    await act(async () => {
      await result.current.accept(IN_ID);
    });

    expect(result.current.incoming).toHaveLength(0);
  });

  it("re-reads rather than guessing when the handshake failed", async () => {
    // A refused write and a challenge that died a second ago produce the same
    // message here, and only the server knows which. Dropping the row on a
    // transient failure would hide a challenge that is still answerable.
    mockStartMatch.mockResolvedValue({
      ok: false,
      error: { code: "CHALLENGE_NOT_ACCEPTED", message: "not accepted" },
    });
    const { result } = await mountLoaded();
    mockCalls.length = 0;

    await act(async () => {
      await result.current.accept(IN_ID);
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "That challenge is no longer available.",
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockCalls).toContain("read");
  });

  it("produces exactly one match for a double tap", async () => {
    const { result } = await mountLoaded();

    await act(async () => {
      const a = result.current.accept(IN_ID);
      const b = result.current.accept(IN_ID);
      await Promise.all([a, b]);
    });

    expect(mockAcceptChallenge).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("locks every other row while one action is in flight", async () => {
    let release: (() => void) | undefined;
    mockAcceptChallenge.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ ok: true, data: undefined });
      }),
    );
    const { result } = await mountLoaded();

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.accept(IN_ID);
      await Promise.resolve();
    });
    expect(result.current.busyId).toBe(IN_ID);

    await act(async () => {
      release?.();
      await pending;
    });
    expect(result.current.busyId).toBeNull();
  });
});

describe("declining from Home", () => {
  it("declines, tells the challenger, and drops the row", async () => {
    const { result } = await mountLoaded();
    mockCalls.length = 0;

    await act(async () => {
      await result.current.decline(IN_ID);
    });

    expect(mockCalls).toEqual(["decline", "send:declined"]);
    expect(result.current.incoming).toHaveLength(0);
  });

  it("keeps the row when the decline write refused", async () => {
    // Still pending server-side, challenger still waiting: dropping it here
    // would lie to both sides.
    mockDeclineChallenge.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "nope" },
    });
    const { result } = await mountLoaded();

    await act(async () => {
      await result.current.decline(IN_ID);
    });

    expect(result.current.incoming).toHaveLength(1);
    expect(mockToastError).toHaveBeenCalled();
  });
});

describe("outgoing challenges", () => {
  it("cancels one, freeing a slot against the cap of 3", async () => {
    const { result } = await mountLoaded();

    await act(async () => {
      await result.current.cancel(OUT_ID);
    });

    expect(mockCancelChallenge).toHaveBeenCalledWith(expect.anything(), OUT_ID);
    expect(result.current.outgoing).toHaveLength(0);
  });

  it("keeps the row when the cancel write refused", async () => {
    mockCancelChallenge.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "nope" },
    });
    const { result } = await mountLoaded();

    await act(async () => {
      await result.current.cancel(OUT_ID);
    });

    expect(result.current.outgoing).toHaveLength(1);
    expect(mockToastError).toHaveBeenCalled();
  });

  it("does NOT broadcast on a cancel", async () => {
    // The opponent's prompt is dismissed by the status change on their own
    // subscription; a broadcast here would be a second, unverified path.
    const { result } = await mountLoaded();
    mockCalls.length = 0;

    await act(async () => {
      await result.current.cancel(OUT_ID);
    });

    expect(mockCalls).toEqual(["cancel"]);
  });

  it("offers a way in when the opponent accepts, instead of dropping the row", async () => {
    // The challenger has to be TOLD. On the Arena they get yanked into the
    // match; on Home they are not standing in a lobby waiting, so they get a
    // row to tap rather than an unrequested navigation off the tab.
    const { result } = await mountLoaded();

    await act(async () => {
      await findBinding("UPDATE", "challenger_id").handler({
        new: {
          id: OUT_ID,
          challenger_id: ME,
          opponent_id: RIVAL,
          status: "accepted",
        },
      });
    });

    expect(result.current.outgoing).toHaveLength(0);
    expect(result.current.ready.map((c) => c.challengeId)).toEqual([OUT_ID]);

    await act(async () => {
      await result.current.enter(OUT_ID);
    });

    expect(mockStartMatch).toHaveBeenCalledWith(expect.anything(), OUT_ID);
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
    expect(result.current.ready).toHaveLength(0);
  });

  it("just removes the row when the opponent declines", async () => {
    const { result } = await mountLoaded();

    await act(async () => {
      await findBinding("UPDATE", "challenger_id").handler({
        new: {
          id: OUT_ID,
          challenger_id: ME,
          opponent_id: RIVAL,
          status: "declined",
        },
      });
    });

    expect(result.current.outgoing).toHaveLength(0);
    expect(result.current.ready).toHaveLength(0);
  });

  it("clears a ready row that turns out to be unusable", async () => {
    mockStartMatch.mockResolvedValue({
      ok: false,
      error: { code: "CHALLENGE_NOT_ACCEPTED", message: "not accepted" },
    });
    const { result } = await mountLoaded();

    await act(async () => {
      await findBinding("UPDATE", "challenger_id").handler({
        new: { id: OUT_ID, challenger_id: ME, opponent_id: RIVAL, status: "accepted" },
      });
    });
    await act(async () => {
      await result.current.enter(OUT_ID);
    });

    expect(result.current.ready).toHaveLength(0);
    expect(mockToastError).toHaveBeenCalledWith(
      "That challenge is no longer available.",
    );
  });
});

describe("realtime", () => {
  it("subscribes in both directions for inserts and updates", async () => {
    await mountLoaded();

    expect(() => findBinding("INSERT", "opponent_id")).not.toThrow();
    expect(() => findBinding("INSERT", "challenger_id")).not.toThrow();
    expect(() => findBinding("UPDATE", "opponent_id")).not.toThrow();
    expect(() => findBinding("UPDATE", "challenger_id")).not.toThrow();
  });

  it("re-reads when a challenge arrives, so the row carries real names", async () => {
    // The realtime payload has ids, not display names, and the query already
    // owns the expiry filter and the ordering.
    const { result } = await mountLoaded();
    mockCalls.length = 0;

    await act(async () => {
      await findBinding("INSERT", "opponent_id").handler({
        new: { id: "ch-new", challenger_id: RIVAL, opponent_id: ME, status: "pending" },
      });
    });

    await waitFor(() => expect(mockCalls).toContain("read"));
    expect(result.current.incoming).toHaveLength(1);
  });

  it("removes an incoming row the challenger cancelled", async () => {
    const { result } = await mountLoaded();

    await act(async () => {
      await findBinding("UPDATE", "opponent_id").handler({
        new: { id: IN_ID, challenger_id: RIVAL, opponent_id: ME, status: "cancelled" },
      });
    });

    expect(result.current.incoming).toHaveLength(0);
  });

  it("removes an incoming row a sweep expired", async () => {
    const { result } = await mountLoaded();

    await act(async () => {
      await findBinding("UPDATE", "opponent_id").handler({
        new: { id: IN_ID, challenger_id: RIVAL, opponent_id: ME, status: "expired" },
      });
    });

    expect(result.current.incoming).toHaveLength(0);
  });

  it("leaves a row alone when a DIFFERENT challenge changes", async () => {
    const { result } = await mountLoaded();

    await act(async () => {
      await findBinding("UPDATE", "opponent_id").handler({
        new: { id: "someone-elses", challenger_id: "x", opponent_id: ME, status: "declined" },
      });
    });

    expect(result.current.incoming).toHaveLength(1);
  });

  it("ignores an UPDATE that is still pending", async () => {
    const { result } = await mountLoaded();

    await act(async () => {
      await findBinding("UPDATE", "opponent_id").handler({
        new: { id: IN_ID, challenger_id: RIVAL, opponent_id: ME, status: "pending" },
      });
    });

    expect(result.current.incoming).toHaveLength(1);
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = await mountLoaded();
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });
});

describe("channel topic", () => {
  /**
   * `supabase.channel(topic)` returns the EXISTING channel when one with that
   * topic is still registered, and `.on("postgres_changes", ...)` on an
   * already-subscribed channel THROWS. Two defences are needed now that there
   * is a second subscriber on `challenges` for the same athlete: a per-mount
   * suffix (an overlapping remount of this hook) and a prefix distinct from
   * the Arena's (both hooks are mounted at once once the Arena tab has been
   * visited, since tabs stay mounted).
   */
  it("gives each mount its own topic", async () => {
    const first = await mountLoaded();
    first.unmount();
    await mountLoaded();

    const inboxTopics = mockChannelTopics.filter((t) =>
      t.startsWith("home-challenge-inbox:"),
    );
    expect(inboxTopics).toHaveLength(2);
    expect(inboxTopics[0]).not.toBe(inboxTopics[1]);
  });

  it("cannot collide with the Arena's subscription on the same table", async () => {
    await mountLoaded();

    const topic = mockChannelTopics.find((t) => t.includes(ME));
    expect(topic).toBeDefined();
    expect(topic).toBe(challengeInboxTopic(ME, topic!.split(":")[2]));
    // Same athlete, same instance id, still two different channels.
    expect(challengeInboxTopic(ME, "abc")).not.toBe(incomingTopic(ME, "abc"));
  });
});
