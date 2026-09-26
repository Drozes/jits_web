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
const mockSweep = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  cancelStaleOutgoingChallenges: (...a: unknown[]) => mockSweep(...a),
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
/** A normal 7-day `expires_at`, well past anything a test waits for. */
const FAR_EXPIRY = new Date(Date.now() + 7 * 86_400_000).toISOString();

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
  mockCreateChallenge.mockResolvedValue({
    ok: true,
    data: { id: CHALLENGE, expiresAt: FAR_EXPIRY },
  });
  mockAcceptChallenge.mockResolvedValue({ ok: true, data: undefined });
  mockDeclineChallenge.mockResolvedValue({ ok: true, data: undefined });
  mockCancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: true } });
  mockSweep.mockResolvedValue({ ok: true, data: { cancelled: [] } });
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
      expiresAt: FAR_EXPIRY,
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

describe("recovery entry points (pending challenges read at mount)", () => {
  it("offerIncoming raises the same prompt the realtime INSERT does", async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.offerIncoming(CHALLENGE, OPPONENT);
    });

    expect(result.current.incoming).toEqual({
      challengeId: CHALLENGE,
      challengerId: OPPONENT,
      challengerName: "Rival",
      challengerElo: 1350,
      challengerWeight: 190,
    });
  });

  it("offerIncoming never replaces a prompt that is already up", async () => {
    const { result } = mount();
    await raiseIncoming(result);

    await act(async () => {
      await result.current.offerIncoming("ch-other", "someone-else");
    });

    expect(result.current.incoming).toMatchObject({ challengeId: CHALLENGE });
  });

  it("offerIncoming does not re-raise a challenge this athlete declined", async () => {
    // The pending read can be a beat behind the decline, and presence syncs
    // keep re-running the recovery pass.
    const { result } = mount();
    await raiseIncoming(result);
    await act(async () => {
      await result.current.decline();
    });
    expect(result.current.incoming).toBeNull();

    await act(async () => {
      await result.current.offerIncoming(CHALLENGE, OPPONENT);
    });

    expect(result.current.incoming).toBeNull();
  });

  it("offerIncoming does not re-raise a challenge the challenger withdrew", async () => {
    const { result } = mount();
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

    await act(async () => {
      await result.current.offerIncoming(CHALLENGE, OPPONENT);
    });

    expect(result.current.incoming).toBeNull();
  });

  it("restoreOutgoing puts the Sent state back so the accept broadcast is heard", async () => {
    const { result } = mount();

    act(() => {
      result.current.restoreOutgoing({
        challengeId: CHALLENGE,
        opponentId: OPPONENT,
        opponentName: "Rival",
      });
    });

    expect(result.current.outgoing).toEqual({
      challengeId: CHALLENGE,
      opponentId: OPPONENT,
      opponentName: "Rival",
    });
    expect(mockChannelTopics).toContain(challengeTopic(CHALLENGE));
  });

  it("restoreOutgoing leaves an existing outgoing challenge alone", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    act(() => {
      result.current.restoreOutgoing({
        challengeId: "ch-old",
        opponentId: "someone-else",
        opponentName: "Old",
      });
    });

    expect(result.current.outgoing).toMatchObject({ challengeId: CHALLENGE });
  });
});

describe("during a match", () => {
  function mountInMatch(inMatch: boolean) {
    return renderHook(
      (props: { inMatch: boolean }) =>
        useArenaChallenge({ athleteId: ME, athleteWeight: 180, inMatch: props.inMatch }),
      { initialProps: { inMatch } },
    );
  }

  it("raises no prompt from a realtime INSERT while in a match", async () => {
    const { result } = mountInMatch(true);

    await act(async () => {
      await incomingBinding().handler({
        new: { id: CHALLENGE, challenger_id: OPPONENT, opponent_id: ME, status: "pending" },
      });
    });

    expect(result.current.incoming).toBeNull();
  });

  it("drops an INSERT whose lookup finished after the match started", async () => {
    let release: (v: unknown) => void = () => {};
    mockMaybeSingle.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    const { result, rerender } = mountInMatch(false);

    let pending: Promise<void> | void;
    await act(async () => {
      pending = incomingBinding().handler({
        new: { id: CHALLENGE, challenger_id: OPPONENT, opponent_id: ME, status: "pending" },
      });
      await Promise.resolve();
    });
    rerender({ inMatch: true });
    await act(async () => {
      release({ data: { display_name: "Rival", current_elo: 1, current_weight: 1 }, error: null });
      await pending;
    });

    expect(result.current.incoming).toBeNull();
  });

  it("offerIncoming is a no-op while in a match", async () => {
    const { result } = mountInMatch(true);

    await act(async () => {
      await result.current.offerIncoming(CHALLENGE, OPPONENT);
    });

    expect(result.current.incoming).toBeNull();
  });
});

describe("while offline", () => {
  function mountLive(isLive: boolean) {
    return renderHook(
      (props: { isLive: boolean }) =>
        useArenaChallenge({ athleteId: ME, athleteWeight: 180, isLive: props.isLive }),
      { initialProps: { isLive } },
    );
  }

  it("raises no prompt from a realtime INSERT while offline (recovery offers it on going live)", async () => {
    const { result } = mountLive(false);

    await act(async () => {
      await incomingBinding().handler({
        new: { id: CHALLENGE, challenger_id: OPPONENT, opponent_id: ME, status: "pending" },
      });
    });

    expect(result.current.incoming).toBeNull();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("drops an INSERT whose lookup finished after going offline", async () => {
    let release: (v: unknown) => void = () => {};
    mockMaybeSingle.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    const { result, rerender } = mountLive(true);

    let pending: Promise<void> | void;
    await act(async () => {
      pending = incomingBinding().handler({
        new: { id: CHALLENGE, challenger_id: OPPONENT, opponent_id: ME, status: "pending" },
      });
      await Promise.resolve();
    });
    rerender({ isLive: false });
    await act(async () => {
      release({ data: { display_name: "Rival", current_elo: 1, current_weight: 1 }, error: null });
      await pending;
    });

    expect(result.current.incoming).toBeNull();
  });

  it("raises the prompt from an INSERT once the athlete goes live", async () => {
    // Production mounts offline (isLive starts false) and flips on go-live.
    const { result, rerender } = mountLive(false);
    rerender({ isLive: true });

    await raiseIncoming(result);

    expect(result.current.incoming).toMatchObject({
      challengeId: CHALLENGE,
      challengerId: OPPONENT,
    });
  });

  it("offerIncoming still raises the prompt (recovery gates on live itself)", async () => {
    const { result } = mountLive(true);

    await act(async () => {
      await result.current.offerIncoming(CHALLENGE, OPPONENT);
    });

    expect(result.current.incoming).toMatchObject({ challengeId: CHALLENGE });
  });
});

describe("INSERT racing another prompt", () => {
  it("keeps the first prompt when a second INSERT's lookup lands after it", async () => {
    let release: (v: unknown) => void = () => {};
    mockMaybeSingle.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    const { result } = mount();

    let slow: Promise<void> | void;
    await act(async () => {
      slow = incomingBinding().handler({
        new: { id: "ch-slow", challenger_id: "slow-1", opponent_id: ME, status: "pending" },
      });
      await Promise.resolve();
    });
    // A second challenge arrives and its lookup resolves first.
    await raiseIncoming(result);

    await act(async () => {
      release({ data: { display_name: "Slow", current_elo: 1, current_weight: 1 }, error: null });
      await slow;
    });

    expect(result.current.incoming).toMatchObject({ challengeId: CHALLENGE });
  });
});

// ---------------------------------------------------------------------------
// jits-1o4l: an outgoing challenge that can no longer become a match
// ---------------------------------------------------------------------------

async function sendOne(result: { current: ReturnType<typeof useArenaChallenge> }) {
  await act(async () => {
    await result.current.sendChallenge(OPPONENT, "Rival");
  });
  expect(result.current.outgoing).not.toBeNull();
}

function challengerUpdate(status: string) {
  return act(async () => {
    await challengerUpdateBinding().handler({
      new: { id: CHALLENGE, challenger_id: ME, opponent_id: OPPONENT, status },
    });
  });
}

describe("the waiting plate never gets stuck (jits-1o4l)", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("clears the plate and says so when the sweep expires the challenge", async () => {
    const { result } = mount();
    await sendOne(result);

    await challengerUpdate("expired");

    expect(result.current.outgoing).toBeNull();
    expect(mockToastInfo).toHaveBeenCalledWith("Your challenge to Rival expired.");
  });

  it("treats any other terminal status as over, quietly", async () => {
    const { result } = mount();
    await sendOne(result);

    await challengerUpdate("some_future_status");

    expect(result.current.outgoing).toBeNull();
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("frees the cap when the challenge expires", async () => {
    mockCreateChallenge
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "MAX_PENDING_CHALLENGES", message: "3 out" },
      })
      .mockResolvedValue({ ok: true, data: { id: CHALLENGE, expiresAt: FAR_EXPIRY } });
    const { result } = mount();
    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });
    expect(result.current.capReached).toBe(true);
    await sendOne(result);
    await challengerUpdate("expired");

    expect(result.current.capReached).toBe(false);
  });

  it("clears the plate on its own at expires_at, without any realtime event", async () => {
    jest.useFakeTimers();
    const soon = new Date(Date.now() + 5_000).toISOString();
    mockCreateChallenge.mockResolvedValue({
      ok: true,
      data: { id: CHALLENGE, expiresAt: soon },
    });
    const { result } = mount();
    await sendOne(result);

    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });
    expect(result.current.outgoing).not.toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(1_500);
    });
    expect(result.current.outgoing).toBeNull();
    expect(mockToastInfo).toHaveBeenCalledWith("Your challenge to Rival expired.");
  });

  it("drops a restored challenge that is already past expires_at", async () => {
    const { result } = mount();
    await act(async () => {
      result.current.restoreOutgoing({
        challengeId: CHALLENGE,
        opponentId: OPPONENT,
        opponentName: "Rival",
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      });
    });

    expect(result.current.outgoing).toBeNull();
  });

  it("re-checks expiry when the app returns to the foreground", async () => {
    // iOS does not run timers while the app is suspended.
    let onAppState: ((s: string) => void) | null = null;
    const { AppState } = jest.requireActual("react-native") as typeof import("react-native");
    jest.spyOn(AppState, "addEventListener").mockImplementation(((
      _e: string,
      handler: (s: string) => void,
    ) => {
      onAppState = handler;
      return { remove: jest.fn() };
    }) as never);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    mockCreateChallenge.mockResolvedValue({
      ok: true,
      data: { id: CHALLENGE, expiresAt },
    });
    const { result } = mount();
    await sendOne(result);

    const later = Date.parse(expiresAt) + 1;
    jest.spyOn(Date, "now").mockReturnValue(later);
    await act(async () => {
      onAppState?.("active");
    });

    expect(result.current.outgoing).toBeNull();
  });
});

describe("Cancel on the waiting plate always resolves (jits-1o4l)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("clears the plate when the challenge was already over (no row changed)", async () => {
    mockCancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: false } });
    mockStartMatch.mockResolvedValue({
      ok: false,
      error: { code: "CHALLENGE_NOT_ACCEPTED", message: "not accepted" },
    });
    const { result } = mount();
    await sendOne(result);

    await act(async () => {
      await result.current.cancelOutgoing();
    });

    expect(result.current.outgoing).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("joins the match instead when the opponent had just started it", async () => {
    // Clearing here would leave the opponent alone in a match nobody joined.
    mockCancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: false } });
    const { result } = mount();
    await sendOne(result);

    await act(async () => {
      await result.current.cancelOutgoing();
    });

    expect(mockStartMatch).toHaveBeenCalledWith(expect.anything(), CHALLENGE);
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
    expect(result.current.outgoing).toBeNull();
  });

  it("does not ask for a match after a real cancel", async () => {
    const { result } = mount();
    await sendOne(result);

    await act(async () => {
      await result.current.cancelOutgoing();
    });

    expect(mockStartMatch).not.toHaveBeenCalled();
    expect(result.current.outgoing).toBeNull();
  });

  it("clears the plate when the database refuses the cancel as not cancellable", async () => {
    mockCancelChallenge.mockResolvedValue({
      ok: false,
      error: { code: "RLS_VIOLATION", message: "denied" },
    });
    const { result } = mount();
    await sendOne(result);

    await act(async () => {
      await result.current.cancelOutgoing();
    });

    expect(result.current.outgoing).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("clears the plate on a failed cancel once the challenge has expired locally", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    mockCreateChallenge.mockResolvedValue({
      ok: true,
      data: { id: CHALLENGE, expiresAt },
    });
    mockCancelChallenge.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "network" },
    });
    const { result } = mount();
    await sendOne(result);

    jest.spyOn(Date, "now").mockReturnValue(Date.parse(expiresAt) + 1);
    await act(async () => {
      await result.current.cancelOutgoing();
    });

    expect(result.current.outgoing).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// jits-celf: stale challenges must not hold the cap
// ---------------------------------------------------------------------------

describe("a capped insert withdraws my stale challenges and retries once (jits-celf)", () => {
  const CAPPED = {
    ok: false,
    error: { code: "MAX_PENDING_CHALLENGES", message: "3 out" },
  };

  it("retries after withdrawing stale ones, and asks for a roster refresh", async () => {
    mockCreateChallenge
      .mockResolvedValueOnce(CAPPED)
      .mockResolvedValue({ ok: true, data: { id: CHALLENGE, expiresAt: FAR_EXPIRY } });
    mockSweep.mockResolvedValue({
      ok: true,
      data: { cancelled: [{ challengeId: "old-1" }] },
    });
    const onStaleCancelled = jest.fn();
    const { result } = renderHook(() =>
      useArenaChallenge({ athleteId: ME, athleteWeight: 180, onStaleCancelled }),
    );

    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    expect(mockSweep).toHaveBeenCalledWith(expect.anything(), ME, {
      keepChallengeId: null,
    });
    expect(mockCreateChallenge).toHaveBeenCalledTimes(2);
    expect(onStaleCancelled).toHaveBeenCalledTimes(1);
    expect(result.current.outgoing).toMatchObject({ challengeId: CHALLENGE });
    expect(result.current.capReached).toBe(false);
  });

  it("does not retry when nothing was stale, and shows the cap", async () => {
    mockCreateChallenge.mockResolvedValue(CAPPED);
    const { result } = mount();

    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    expect(mockSweep).toHaveBeenCalledTimes(1);
    expect(mockCreateChallenge).toHaveBeenCalledTimes(1);
    expect(result.current.capReached).toBe(true);
  });

  it("retries exactly once, then shows the cap if still refused", async () => {
    mockCreateChallenge.mockResolvedValue(CAPPED);
    mockSweep.mockResolvedValue({
      ok: true,
      data: { cancelled: [{ challengeId: "old-1" }] },
    });
    const { result } = mount();

    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    expect(mockCreateChallenge).toHaveBeenCalledTimes(2);
    expect(mockSweep).toHaveBeenCalledTimes(1);
    expect(result.current.capReached).toBe(true);
  });

  it("still shows the cap when the sweep's read failed", async () => {
    mockCreateChallenge.mockResolvedValue(CAPPED);
    mockSweep.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "down" },
    });
    const { result } = mount();

    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    expect(mockCreateChallenge).toHaveBeenCalledTimes(1);
    expect(result.current.capReached).toBe(true);
  });

  it("does not sweep for a failure that is not the cap", async () => {
    mockCreateChallenge.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "network is down" },
    });
    const { result } = mount();

    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });

    expect(mockSweep).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// jits-yiwx: a match that starts by another route
// ---------------------------------------------------------------------------

describe("a match started by another route (jits-yiwx)", () => {
  function mountWithMatch() {
    return renderHook(
      (props: { inMatch: boolean }) =>
        useArenaChallenge({ athleteId: ME, athleteWeight: 180, inMatch: props.inMatch }),
      { initialProps: { inMatch: false } },
    );
  }

  it("drops the prompt instead of holding it over the match", async () => {
    const { result, rerender } = mountWithMatch();
    await raiseIncoming(result);

    await act(async () => {
      rerender({ inMatch: true });
    });

    expect(result.current.incoming).toBeNull();
  });

  it("leaves the dropped challenge re-offerable after the match", async () => {
    const { result, rerender } = mountWithMatch();
    await raiseIncoming(result);
    await act(async () => {
      rerender({ inMatch: true });
    });
    await act(async () => {
      rerender({ inMatch: false });
    });

    let raised = false;
    await act(async () => {
      raised = await result.current.offerIncoming(CHALLENGE, OPPONENT);
    });

    expect(raised).toBe(true);
    expect(result.current.incoming).toMatchObject({ challengeId: CHALLENGE });
  });

  it("offerIncoming reports a skip as false", async () => {
    const { result } = renderHook(() =>
      useArenaChallenge({ athleteId: ME, athleteWeight: 180, inMatch: true }),
    );

    let raised = true;
    await act(async () => {
      raised = await result.current.offerIncoming(CHALLENGE, OPPONENT);
    });

    expect(raised).toBe(false);
  });
});
