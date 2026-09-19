/**
 * The Arena handshake.
 *
 * The ordering in `accept` is the load-bearing part: acceptChallenge, then
 * startMatchFromChallenge, then BROADCAST, and only then navigate. The
 * broadcast is what pulls the challenger off the waiting plate into the same
 * match; navigate first and they sit there while the acceptor is already in
 * the wizard.
 *
 * Failure is always derived from returned DATA, never from a rejection:
 * supabase-js resolves transport errors into `{ data: null, error }` and
 * channel.send() resolves to "ok" / "error" / "timed out", so a test that
 * drove failure with mockRejectedValue would be testing a path production
 * cannot produce.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { challengeTopic } from "@/lib/arena/constants";

// ---- mocks ----

const mockCalls: string[] = [];

interface Binding {
  topic: string;
  type: string;
  filter: Record<string, string>;
  handler: (payload: unknown) => void | Promise<void>;
}

const mockBindings: Binding[] = [];
const mockSend = jest.fn();
const mockRemoveChannel = jest.fn();
const mockChannelTopics: string[] = [];

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

const mockMaybeSingle = jest.fn();
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: (topic: string) => {
      mockChannelTopics.push(topic);
      return mockMakeChannel(topic);
    },
    removeChannel: (...a: unknown[]) => mockRemoveChannel(...a),
    from: () => ({
      // Columns are passed through so a test can tell the challenger-name
      // lookup apart from the opponent-eligibility re-read.
      select: (columns: string) => ({
        eq: () => ({ maybeSingle: () => mockMaybeSingle(columns) }),
      }),
    }),
  },
}));

const mockCreateChallenge = jest.fn();
const mockAcceptChallenge = jest.fn();
const mockDeclineChallenge = jest.fn();
const mockCancelChallenge = jest.fn();
const mockStartMatch = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  createChallenge: (...a: unknown[]) => mockCreateChallenge(...a),
  acceptChallenge: (...a: unknown[]) => mockAcceptChallenge(...a),
  declineChallenge: (...a: unknown[]) => mockDeclineChallenge(...a),
  cancelChallenge: (...a: unknown[]) => mockCancelChallenge(...a),
  startMatchFromChallenge: (...a: unknown[]) => mockStartMatch(...a),
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

import { useArenaChallenge } from "@/lib/arena/use-arena-challenge";

// ---- fixtures ----

const ME = "me-1";
const OPPONENT = "opp-1";
const CHALLENGE = "ch-1";
const MATCH = "match-1";

function findBinding(type: string, match: (f: Record<string, string>) => boolean) {
  const found = mockBindings.find((b) => b.type === type && match(b.filter));
  if (!found) throw new Error(`no ${type} binding found`);
  return found;
}

/** The INSERT that raises an incoming prompt. */
function incomingBinding() {
  return findBinding(
    "postgres_changes",
    (f) => f.event === "INSERT" && f.filter === `opponent_id=eq.${ME}`,
  );
}

/** Status changes on a challenge where I am the opponent. */
function opponentUpdateBinding() {
  return findBinding(
    "postgres_changes",
    (f) => f.event === "UPDATE" && f.filter === `opponent_id=eq.${ME}`,
  );
}

/** Status changes on a challenge I sent. */
function challengerUpdateBinding() {
  return findBinding(
    "postgres_changes",
    (f) => f.event === "UPDATE" && f.filter === `challenger_id=eq.${ME}`,
  );
}

function mount(weight: number | null = 180) {
  return renderHook(() =>
    useArenaChallenge({ athleteId: ME, athleteWeight: weight }),
  );
}

async function raiseIncoming(
  result: { current: { incoming: unknown } },
  row: Record<string, unknown> = {},
) {
  await act(async () => {
    await incomingBinding().handler({
      new: {
        id: CHALLENGE,
        challenger_id: OPPONENT,
        opponent_id: ME,
        status: "pending",
        ...row,
      },
    });
  });
  await waitFor(() => expect(result.current.incoming).not.toBeNull());
}

beforeEach(() => {
  mockCalls.length = 0;
  mockBindings.length = 0;
  mockChannelTopics.length = 0;
  jest.clearAllMocks();
  mockSend.mockResolvedValue("ok");
  mockMaybeSingle.mockImplementation((columns: string) =>
    columns.includes("looking_for_ranked")
      ? // Eligibility re-read: by default the opponent is still there, so a
        // refused insert really is the cap.
        Promise.resolve({
          data: { looking_for_ranked: true, status: "active" },
          error: null,
        })
      : Promise.resolve({
          data: { display_name: "Rival", current_elo: 1350, current_weight: 190 },
          error: null,
        }),
  );
  mockCreateChallenge.mockResolvedValue({ ok: true, data: { id: CHALLENGE } });
  mockAcceptChallenge.mockResolvedValue({ ok: true, data: undefined });
  mockDeclineChallenge.mockResolvedValue({ ok: true, data: undefined });
  mockCancelChallenge.mockResolvedValue({ ok: true, data: undefined });
  mockStartMatch.mockResolvedValue({
    ok: true,
    data: { success: true, match_id: MATCH, challenge_id: CHALLENGE },
  });
});

describe("sending a challenge", () => {
  it("sends a ranked challenge and shows it as pending", async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    expect(mockCreateChallenge).toHaveBeenCalledWith(
      expect.anything(),
      { opponentId: OPPONENT, matchType: "ranked", challengerWeight: 180 },
    );
    expect(result.current.outgoing).toEqual({
      challengeId: CHALLENGE,
      opponentId: OPPONENT,
      opponentName: "Rival",
    });
  });

  it("produces exactly one challenge for a double tap", async () => {
    const { result } = mount();

    await act(async () => {
      const a = result.current.sendChallenge(OPPONENT, "Rival");
      const b = result.current.sendChallenge(OPPONENT, "Rival");
      await Promise.all([a, b]);
    });

    expect(mockCreateChallenge).toHaveBeenCalledTimes(1);
  });

  it("surfaces the 3-challenge cap as a standing state, not a toast", async () => {
    // can_create_challenge() caps non-expired pending outgoing challenges at
    // 3 inside the challenges_insert WITH CHECK, so the fourth insert is
    // refused by the database. That is a rule, not a hiccup.
    mockCreateChallenge.mockResolvedValue({
      ok: false,
      error: {
        code: "MAX_PENDING_CHALLENGES",
        message: "You already have 3 pending challenges.",
      },
    });
    const { result } = mount();

    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    expect(result.current.capReached).toBe(true);
    expect(result.current.outgoing).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("does NOT claim the cap when the opponent simply left the Arena", async () => {
    // mapPostgrestError collapses every 42501 on this insert into
    // MAX_PENDING_CHALLENGES, but opponent_accepts_match_type is a reachable
    // cause: the roster is a snapshot and this design has people going
    // offline constantly, so the opponent can clear their looking_for_ranked
    // between the load and the tap. A standing "cancel one of your three"
    // plate would then be a flat lie that also disables every row.
    mockCreateChallenge.mockResolvedValue({
      ok: false,
      error: { code: "MAX_PENDING_CHALLENGES", message: "3 pending" },
    });
    mockMaybeSingle.mockImplementation((columns: string) =>
      columns.includes("looking_for_ranked")
        ? Promise.resolve({
            data: { looking_for_ranked: false, status: "active" },
            error: null,
          })
        : Promise.resolve({ data: null, error: null }),
    );
    const onUnavailable = jest.fn();
    const { result } = renderHook(() =>
      useArenaChallenge({
        athleteId: ME,
        athleteWeight: 180,
        onOpponentUnavailable: onUnavailable,
      }),
    );

    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    expect(result.current.capReached).toBe(false);
    expect(mockToastInfo).toHaveBeenCalledWith("Rival just left the Arena.");
    expect(onUnavailable).toHaveBeenCalledWith(OPPONENT);
  });

  it("does not assert the cap on an eligibility read it could not make", async () => {
    // An unverified standing banner that disables the whole surface is a
    // worse answer than an unhelpful toast.
    mockCreateChallenge.mockResolvedValue({
      ok: false,
      error: { code: "MAX_PENDING_CHALLENGES", message: "3 pending" },
    });
    mockMaybeSingle.mockImplementation((columns: string) =>
      columns.includes("looking_for_ranked")
        ? Promise.resolve({ data: null, error: { message: "network" } })
        : Promise.resolve({ data: null, error: null }),
    );
    const { result } = mount();

    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    expect(result.current.capReached).toBe(false);
    expect(mockToastError).toHaveBeenCalled();
  });

  it("toasts other failures and leaves the row challengeable", async () => {
    mockCreateChallenge.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "network is down" },
    });
    const { result } = mount();

    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    expect(mockToastError).toHaveBeenCalledWith("network is down");
    expect(result.current.capReached).toBe(false);
    expect(result.current.outgoing).toBeNull();
  });

  it("clears the cap once a challenge is cancelled", async () => {
    mockCreateChallenge.mockResolvedValueOnce({
      ok: false,
      error: { code: "MAX_PENDING_CHALLENGES", message: "3 out" },
    });
    const { result } = mount();
    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });
    expect(result.current.capReached).toBe(true);

    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });
    await act(async () => {
      await result.current.cancelOutgoing();
    });

    expect(mockCancelChallenge).toHaveBeenCalledWith(expect.anything(), CHALLENGE);
    expect(result.current.capReached).toBe(false);
    expect(result.current.outgoing).toBeNull();
  });

  it("keeps the waiting plate when the cancel write failed", async () => {
    mockCancelChallenge.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "nope" },
    });
    const { result } = mount();
    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    await act(async () => {
      await result.current.cancelOutgoing();
    });

    expect(result.current.outgoing).not.toBeNull();
    expect(mockToastError).toHaveBeenCalled();
  });
});

describe("receiving a challenge", () => {
  it("raises a live prompt from the filtered INSERT", async () => {
    const { result } = mount();
    await raiseIncoming(result);

    expect(result.current.incoming).toEqual({
      challengeId: CHALLENGE,
      challengerId: OPPONENT,
      challengerName: "Rival",
      challengerElo: 1350,
      challengerWeight: 190,
    });
  });

  it("names the challenger honestly when the lookup returns nothing", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "rls" } });
    const { result } = mount();
    await raiseIncoming(result);

    expect(result.current.incoming).toMatchObject({
      challengerName: "An athlete",
      challengerElo: null,
    });
  });

  it("ignores an INSERT that is already expired", async () => {
    const { result } = mount();
    await act(async () => {
      await incomingBinding().handler({
        new: {
          id: CHALLENGE,
          challenger_id: OPPONENT,
          opponent_id: ME,
          status: "pending",
          expires_at: new Date(Date.now() - 1000).toISOString(),
        },
      });
    });

    expect(result.current.incoming).toBeNull();
  });

  it("dismisses the prompt when the challenger cancels", async () => {
    const { result } = mount();
    await raiseIncoming(result);

    await act(async () => {
      await opponentUpdateBinding().handler({
        new: {
          id: CHALLENGE,
          challenger_id: OPPONENT,
          opponent_id: ME,
          status: "cancelled",
        },
      });
    });

    expect(result.current.incoming).toBeNull();
  });

  it("leaves the prompt alone when a DIFFERENT challenge changes", async () => {
    const { result } = mount();
    await raiseIncoming(result);

    await act(async () => {
      await opponentUpdateBinding().handler({
        new: {
          id: "some-other-challenge",
          challenger_id: "someone",
          opponent_id: ME,
          status: "cancelled",
        },
      });
    });

    expect(result.current.incoming).not.toBeNull();
  });
});

describe("accepting", () => {
  it("broadcasts match_started BEFORE navigating", async () => {
    const { result } = mount();
    await raiseIncoming(result);
    mockCalls.length = 0;

    await act(async () => {
      await result.current.accept();
    });

    expect(mockAcceptChallenge).toHaveBeenCalledWith(
      expect.anything(),
      { challengeId: CHALLENGE, opponentWeight: 180 },
    );
    expect(mockStartMatch).toHaveBeenCalledWith(expect.anything(), CHALLENGE);
    // The whole point of the handshake: both parties land together.
    expect(mockCalls).toEqual([
      "send:match_started",
      `push:/match/${MATCH}`,
    ]);
    expect(mockChannelTopics).toContain(challengeTopic(CHALLENGE));
  });

  it("retries a broadcast that did not report ok", async () => {
    // send() resolves "error" rather than rejecting, so a .catch() here would
    // never fire and the challenger would be stranded.
    mockSend.mockResolvedValueOnce("error").mockResolvedValueOnce("ok");
    const { result } = mount();
    await raiseIncoming(result);

    await act(async () => {
      await result.current.accept();
    });

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
  });

  it("asks the server for the match exactly once", async () => {
    // Both parties may call start_match_from_challenge for the same
    // challenge. They converge without any client retry: matches.challenge_id
    // is UNIQUE and the function's own EXCEPTION block catches
    // unique_violation, re-selects the winner's id and returns success, so no
    // 23505 ever reaches PostgREST. A retry on MATCH_ALREADY_EXISTS would be
    // dead code guarding a response the server cannot produce.
    const { result } = mount();
    await raiseIncoming(result);

    await act(async () => {
      await result.current.accept();
    });

    expect(mockStartMatch).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
  });

  it("still enters the match on a SECOND accept in the same session", async () => {
    // The Arena is a tab screen with no unmountOnBlur under an (app) Stack,
    // so this hook instance survives the round trip into a match and back. A
    // one-shot "already navigated" latch would make every later accept a
    // silent no-op: the server creates the match, the opponent navigates in,
    // and this athlete sits on a stale prompt, alone in a match they never
    // joined.
    const { result } = mount();

    await raiseIncoming(result);
    await act(async () => {
      await result.current.accept();
    });
    expect(mockPush).toHaveBeenCalledTimes(1);

    // Back in the Arena, a different challenge from someone else.
    mockStartMatch.mockResolvedValue({
      ok: true,
      data: { success: true, match_id: "match-2", challenge_id: "ch-2" },
    });
    await act(async () => {
      await incomingBinding().handler({
        new: {
          id: "ch-2",
          challenger_id: "opp-2",
          opponent_id: ME,
          status: "pending",
        },
      });
    });
    await waitFor(() => expect(result.current.incoming).not.toBeNull());

    await act(async () => {
      await result.current.accept();
    });

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenLastCalledWith("/match/match-2");
    expect(result.current.incoming).toBeNull();
  });

  it("says a dead challenge is dead instead of blaming the match start", async () => {
    // acceptChallenge filters on status = 'pending' and a PostgREST update
    // matching no rows is NOT an error, so a cancelled or expired challenge
    // still returns ok. The truth arrives from start_match_from_challenge.
    mockStartMatch.mockResolvedValue({
      ok: false,
      error: {
        code: "CHALLENGE_NOT_ACCEPTED",
        message: "Challenge has not been accepted yet.",
      },
    });
    const { result } = mount();
    await raiseIncoming(result);

    await act(async () => {
      await result.current.accept();
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "That challenge is no longer available.",
    );
    expect(result.current.incoming).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("produces exactly one match for a double tap on Accept", async () => {
    const { result } = mount();
    await raiseIncoming(result);

    await act(async () => {
      const a = result.current.accept();
      const b = result.current.accept();
      await Promise.all([a, b]);
    });

    expect(mockAcceptChallenge).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

describe("declining", () => {
  it("declines, tells the challenger, and clears the prompt", async () => {
    const { result } = mount();
    await raiseIncoming(result);
    mockCalls.length = 0;

    await act(async () => {
      await result.current.decline();
    });

    expect(mockDeclineChallenge).toHaveBeenCalledWith(expect.anything(), CHALLENGE);
    expect(mockCalls).toEqual(["send:declined"]);
    expect(result.current.incoming).toBeNull();
  });

  it("keeps the prompt up when the decline write failed", async () => {
    // The challenge is still pending server-side and the challenger is still
    // waiting; dismissing here would lie to both sides.
    mockDeclineChallenge.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "nope" },
    });
    const { result } = mount();
    await raiseIncoming(result);

    await act(async () => {
      await result.current.decline();
    });

    expect(result.current.incoming).not.toBeNull();
    expect(mockToastError).toHaveBeenCalled();
  });
});

describe("the challenger's side", () => {
  it("enters the match when the accept broadcast arrives", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    const broadcastBinding = mockBindings.find(
      (b) =>
        b.topic === challengeTopic(CHALLENGE) &&
        b.type === "broadcast" &&
        b.filter.event === "match_started",
    );
    expect(broadcastBinding).toBeDefined();

    await act(async () => {
      await broadcastBinding?.handler({ payload: { matchId: MATCH } });
    });

    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
    expect(result.current.outgoing).toBeNull();
  });

  it("returns the row to challengeable when the opponent declines", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    await act(async () => {
      await challengerUpdateBinding().handler({
        new: {
          id: CHALLENGE,
          challenger_id: ME,
          opponent_id: OPPONENT,
          status: "declined",
        },
      });
    });

    expect(result.current.outgoing).toBeNull();
    expect(mockToastInfo).toHaveBeenCalledWith("Rival declined.");
  });

  it("recovers into the match when the broadcast never arrived", async () => {
    // A lost broadcast would otherwise strand the challenger on the waiting
    // plate forever. The status change is the second witness, and
    // start_match_from_challenge is idempotent for either party.
    const { result } = mount();
    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    await act(async () => {
      await challengerUpdateBinding().handler({
        new: {
          id: CHALLENGE,
          challenger_id: ME,
          opponent_id: OPPONENT,
          status: "accepted",
        },
      });
    });

    expect(mockStartMatch).toHaveBeenCalledWith(expect.anything(), CHALLENGE);
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
  });

  it("navigates once when the broadcast and the status change both land", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    const broadcastBinding = mockBindings.find(
      (b) =>
        b.topic === challengeTopic(CHALLENGE) &&
        b.type === "broadcast" &&
        b.filter.event === "match_started",
    );

    await act(async () => {
      await broadcastBinding?.handler({ payload: { matchId: MATCH } });
      await challengerUpdateBinding().handler({
        new: {
          id: CHALLENGE,
          challenger_id: ME,
          opponent_id: OPPONENT,
          status: "started",
        },
      });
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("ignores status changes for a challenge that is not the pending one", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    await act(async () => {
      await challengerUpdateBinding().handler({
        new: {
          id: "another-challenge",
          challenger_id: ME,
          opponent_id: "someone",
          status: "accepted",
        },
      });
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(result.current.outgoing).not.toBeNull();
  });
});

describe("teardown", () => {
  it("removes its channels on unmount", async () => {
    const { result, unmount } = mount();
    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });
    mockRemoveChannel.mockClear();

    unmount();

    const removedTopics = mockRemoveChannel.mock.calls.map(
      (c) => (c[0] as { topic: string }).topic,
    );
    expect(removedTopics).toContain(challengeTopic(CHALLENGE));
    expect(
      removedTopics.some((t) => t.startsWith(`arena-incoming:${ME}:`)),
    ).toBe(true);
  });

  it("gives the incoming channel a per-instance topic", async () => {
    const first = mount();
    const second = mount();

    const incomingTopics = mockChannelTopics.filter((t) =>
      t.startsWith(`arena-incoming:${ME}:`),
    );
    expect(incomingTopics).toHaveLength(2);
    // supabase.channel() hands back the EXISTING channel for a topic that is
    // still registered, and .on("postgres_changes") throws on an already
    // subscribed channel. Two live instances must not collide.
    expect(incomingTopics[0]).not.toBe(incomingTopics[1]);

    first.unmount();
    second.unmount();
  });
});
