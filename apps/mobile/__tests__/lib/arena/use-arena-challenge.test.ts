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

interface MockChannel {
  topic: string;
  statusCb: ((status: string) => void) | null;
}
/** Channels the client still holds (what `getChannels()` returns). */
const mockRegistered: MockChannel[] = [];
/** Every channel ever built, in order. */
const mockBuilt: MockChannel[] = [];

function mockMakeChannel(topic: string) {
  const channel = {
    topic,
    statusCb: null as ((status: string) => void) | null,
    on(type: string, filter: Record<string, string>, handler: Binding["handler"]) {
      mockBindings.push({ topic, type, filter, handler });
      return channel;
    },
    subscribe(cb?: (status: string) => void) {
      channel.statusCb = cb ?? null;
      return channel;
    },
    send(msg: { event: string }) {
      mockCalls.push(`send:${msg.event}`);
      return mockSend(msg, topic);
    },
  };
  return channel;
}

const mockMaybeSingle = jest.fn();
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: (topic: string) => {
      mockChannelTopics.push(topic);
      const channel = mockMakeChannel(topic);
      mockRegistered.push(channel);
      mockBuilt.push(channel);
      return channel;
    },
    getChannels: () => [...mockRegistered],
    removeChannel: (channel: MockChannel, ...rest: unknown[]) => {
      const i = mockRegistered.indexOf(channel);
      if (i >= 0) mockRegistered.splice(i, 1);
      return mockRemoveChannel(channel, ...rest);
    },
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
const mockDeclineOthers = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  cancelStaleOutgoingChallenges: (...a: unknown[]) => mockSweep(...a),
  declineOtherPendingChallenges: (...a: unknown[]) => mockDeclineOthers(...a),
  createChallenge: (...a: unknown[]) => mockCreateChallenge(...a),
  acceptChallenge: (...a: unknown[]) => mockAcceptChallenge(...a),
  declineChallenge: (...a: unknown[]) => mockDeclineChallenge(...a),
  cancelChallenge: (...a: unknown[]) => mockCancelChallenge(...a),
  startMatchFromChallenge: (...a: unknown[]) => mockStartMatch(...a),
}));

const mockGetStatus = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getChallengeStatus: (...a: unknown[]) => mockGetStatus(...a),
}));

const mockResync = jest.fn();
jest.mock("@/lib/arena/use-pending-challenge-recovery", () => ({
  requestPendingChallengeResync: () => mockResync(),
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
  mockRegistered.length = 0;
  mockBuilt.length = 0;
  jest.clearAllMocks();
  mockDeclineOthers.mockResolvedValue({ ok: true, data: { declined: [], skipped: [] } });
  mockGetStatus.mockResolvedValue({
    ok: true,
    data: { status: "pending", expiresAt: FAR_EXPIRY },
  });
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
    const { result, rerender } = renderHook(
      ({ inMatch }: { inMatch: boolean }) =>
        useArenaChallenge({ athleteId: ME, athleteWeight: 180, inMatch }),
      { initialProps: { inMatch: false } },
    );

    await raiseIncoming(result);
    await act(async () => {
      await result.current.accept();
    });
    expect(mockPush).toHaveBeenCalledTimes(1);

    // The match screen mounts, the match ends, the screen goes.
    rerender({ inMatch: true });
    rerender({ inMatch: false });

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
    // plate forever. The `started` status change is the second witness, and
    // start_match_from_challenge returns the existing match.
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
          status: "started",
        },
      });
    });

    expect(mockStartMatch).toHaveBeenCalledWith(expect.anything(), CHALLENGE);
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
  });

  it("does NOT start the match on 'accepted' (jits-njyd)", async () => {
    // Starting it here races the accepter's own start: whoever holds the row
    // lock second re-reads `started` and fails not_accepted, stranding the
    // accepter. The accepter's broadcast or the `started` UPDATE follows.
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

    expect(mockStartMatch).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(result.current.outgoing).not.toBeNull();
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
    // Several listeners are registered (expiry, the plate re-read, channel
    // supervision), so every one of them hears the return.
    const handlers: Array<(s: string) => void> = [];
    const onAppState = (s: string) => handlers.forEach((h) => h(s));
    const { AppState } = jest.requireActual("react-native") as typeof import("react-native");
    jest.spyOn(AppState, "addEventListener").mockImplementation(((
      _e: string,
      handler: (s: string) => void,
    ) => {
      handlers.push(handler);
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
      onAppState("active");
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

    let outcome = "";
    await act(async () => {
      outcome = await result.current.offerIncoming(CHALLENGE, OPPONENT);
    });

    expect(outcome).toBe("raised");
    expect(result.current.incoming).toMatchObject({ challengeId: CHALLENGE });
  });

  it("offerIncoming reports a skip as false", async () => {
    const { result } = renderHook(() =>
      useArenaChallenge({ athleteId: ME, athleteWeight: 180, inMatch: true }),
    );

    let outcome = "";
    await act(async () => {
      outcome = await result.current.offerIncoming(CHALLENGE, OPPONENT);
    });

    // In a match: the surface is busy, not the challenge dead.
    expect(outcome).toBe("retry");
  });
});

// ---------------------------------------------------------------------------
// Group-demo concurrency: many people challenging at once
// ---------------------------------------------------------------------------

function pendingRow(challengeId: string, challengerId: string) {
  return {
    challengeId,
    challengerId,
    opponentId: ME,
    challengerName: "Other",
    opponentName: "Me",
    matchType: "ranked",
    createdAt: new Date().toISOString(),
    expiresAt: FAR_EXPIRY,
    challengerWeight: null,
    opponentWeight: null,
  };
}

/** Put a plate up for my own challenge to `opponentId`. */
async function withOutgoing(
  result: { current: ReturnType<typeof useArenaChallenge> },
  challengeId: string,
  opponentId: string,
  opponentName = "Rival",
) {
  await act(async () => {
    result.current.restoreOutgoing({
      challengeId,
      opponentId,
      opponentName,
      expiresAt: FAR_EXPIRY,
    });
  });
  expect(result.current.outgoing?.challengeId).toBe(challengeId);
}

async function withIncoming(
  result: { current: ReturnType<typeof useArenaChallenge> },
  challengeId: string,
  challengerId: string,
) {
  await act(async () => {
    await result.current.offerIncoming(challengeId, challengerId);
  });
  expect(result.current.incoming?.challengeId).toBe(challengeId);
}

describe("three challengers, one target", () => {
  it("entering a match declines every OTHER pending challenge and tells each challenger", async () => {
    mockDeclineOthers.mockResolvedValue({
      ok: true,
      data: {
        declined: [pendingRow("ch-b", "opp-b"), pendingRow("ch-c", "opp-c")],
        skipped: [],
      },
    });
    const { result } = mount();
    await raiseIncoming(result);

    await act(async () => {
      await result.current.accept();
    });

    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
    expect(mockDeclineOthers).toHaveBeenCalledWith(expect.anything(), ME, {
      keepChallengeId: CHALLENGE,
      exceptChallengerId: OPPONENT,
    });
    await waitFor(() =>
      expect(mockChannelTopics).toEqual(
        expect.arrayContaining([challengeTopic("ch-b"), challengeTopic("ch-c")]),
      ),
    );
    expect(mockCalls.filter((c) => c === "send:declined")).toHaveLength(2);
  });

  it("does not offer a declined-on-entry challenge again", async () => {
    mockDeclineOthers.mockResolvedValue({
      ok: true,
      data: { declined: [pendingRow("ch-b", "opp-b")], skipped: [] },
    });
    const { result, rerender } = renderHook(
      ({ inMatch }: { inMatch: boolean }) =>
        useArenaChallenge({ athleteId: ME, athleteWeight: 180, inMatch }),
      { initialProps: { inMatch: false } },
    );
    await raiseIncoming(result);
    await act(async () => {
      await result.current.accept();
    });
    rerender({ inMatch: true });
    rerender({ inMatch: false });

    let outcome = "";
    await act(async () => {
      outcome = await result.current.offerIncoming("ch-b", "opp-b");
    });
    expect(outcome).toBe("final");
  });

  it("entering as the CHALLENGER also clears everyone waiting on me", async () => {
    const { result } = mount();
    await sendOne(result);
    const b = mockBindings.find(
      (x) => x.topic === challengeTopic(CHALLENGE) && x.filter.event === "match_started",
    );
    await act(async () => {
      await b?.handler({ payload: { matchId: MATCH } });
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockDeclineOthers).toHaveBeenCalledWith(expect.anything(), ME, {
      keepChallengeId: CHALLENGE,
      exceptChallengerId: OPPONENT,
    });
  });

  it("offers the next queued challenger when I decline (pending re-read)", async () => {
    const { result } = mount();
    await raiseIncoming(result);
    await act(async () => {
      await result.current.decline();
    });
    expect(mockResync).toHaveBeenCalledTimes(1);
  });

  it("re-reads pending when the challenger withdraws the prompt", async () => {
    const { result } = mount();
    await raiseIncoming(result);
    await act(async () => {
      await opponentUpdateBinding().handler({
        new: { id: CHALLENGE, challenger_id: OPPONENT, opponent_id: ME, status: "cancelled" },
      });
    });
    expect(result.current.incoming).toBeNull();
    expect(mockResync).toHaveBeenCalledTimes(1);
  });

  it("does not re-read for an UPDATE to a challenge that is not on screen", async () => {
    const { result } = mount();
    await raiseIncoming(result);
    await act(async () => {
      await opponentUpdateBinding().handler({
        new: { id: "other", challenger_id: "x", opponent_id: ME, status: "declined" },
      });
    });
    expect(mockResync).not.toHaveBeenCalled();
  });

  it("re-reads pending when an accept finds the challenge dead", async () => {
    mockStartMatch.mockResolvedValue({
      ok: false,
      error: { code: "CHALLENGE_NOT_ACCEPTED", message: "not accepted" },
    });
    const { result } = mount();
    await raiseIncoming(result);
    await act(async () => {
      await result.current.accept();
    });
    expect(mockResync).toHaveBeenCalledTimes(1);
  });

  it("retries a start that lost the row lock to the challenger, once (jits-njyd)", async () => {
    mockStartMatch
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "CHALLENGE_NOT_ACCEPTED", message: "not accepted" },
      })
      .mockResolvedValue({
        ok: true,
        data: { success: true, match_id: MATCH, challenge_id: CHALLENGE },
      });
    const { result } = mount();
    await raiseIncoming(result);
    await act(async () => {
      await result.current.accept();
    });

    expect(mockStartMatch).toHaveBeenCalledTimes(2);
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
  });
});

describe("accepting while my own challenge is out", () => {
  const MINE = "ch-mine";
  const B = "opp-b";

  it("withdraws mine first, quietly, then accepts", async () => {
    const order: string[] = [];
    mockCancelChallenge.mockImplementation(async (_c: unknown, id: string) => {
      order.push(`cancel:${id}`);
      return { ok: true, data: { cancelled: true } };
    });
    mockAcceptChallenge.mockImplementation(async () => {
      order.push("accept");
      return { ok: true, data: undefined };
    });
    const { result } = mount();
    await withOutgoing(result, MINE, B);
    await raiseIncoming(result);

    await act(async () => {
      await result.current.accept();
    });

    expect(order.slice(0, 2)).toEqual([`cancel:${MINE}`, "accept"]);
    expect(mockCancelChallenge).toHaveBeenCalledWith(expect.anything(), MINE, {
      onlyIfPending: true,
    });
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
  });

  it("joins MY match instead when it had already started", async () => {
    mockCancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: false } });
    mockGetStatus.mockResolvedValue({ ok: true, data: { status: "started", expiresAt: FAR_EXPIRY } });
    mockStartMatch.mockResolvedValue({
      ok: true,
      data: { success: true, match_id: "match-mine", challenge_id: MINE },
    });
    const { result } = mount();
    await withOutgoing(result, MINE, B);
    await raiseIncoming(result);

    await act(async () => {
      await result.current.accept();
    });

    expect(mockAcceptChallenge).not.toHaveBeenCalled();
    expect(mockStartMatch).toHaveBeenCalledWith(expect.anything(), MINE);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/match/match-mine");
    // The incoming one is declined by the entry settle (it is not from B).
    expect(mockDeclineOthers).toHaveBeenCalledWith(expect.anything(), ME, {
      keepChallengeId: MINE,
      exceptChallengerId: B,
    });
    expect(result.current.incoming).toBeNull();
  });

  it("keeps waiting when mine was just accepted, and declines the incoming", async () => {
    mockCancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: false } });
    mockGetStatus.mockResolvedValue({ ok: true, data: { status: "accepted", expiresAt: FAR_EXPIRY } });
    const { result } = mount();
    await withOutgoing(result, MINE, B);
    await raiseIncoming(result);
    mockCalls.length = 0;

    await act(async () => {
      await result.current.accept();
    });

    expect(mockAcceptChallenge).not.toHaveBeenCalled();
    // jits-njyd: never start a challenge that is only `accepted`.
    expect(mockStartMatch).not.toHaveBeenCalled();
    expect(mockDeclineChallenge).toHaveBeenCalledWith(expect.anything(), CHALLENGE);
    expect(mockCalls).toEqual(["send:declined"]);
    expect(result.current.incoming).toBeNull();
    expect(result.current.outgoing?.challengeId).toBe(MINE);
    expect(mockPush).not.toHaveBeenCalled();

    // B's start lands: the broadcast brings me in.
    const b = mockBindings.find(
      (x) => x.topic === challengeTopic(MINE) && x.filter.event === "match_started",
    );
    await act(async () => {
      await b?.handler({ payload: { matchId: "match-mine" } });
    });
    expect(mockPush).toHaveBeenCalledWith("/match/match-mine");
  });

  it("drops mine QUIETLY when it was declined meanwhile, then accepts", async () => {
    mockCancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: false } });
    mockGetStatus.mockResolvedValue({ ok: true, data: { status: "declined", expiresAt: FAR_EXPIRY } });
    const { result } = mount();
    await withOutgoing(result, MINE, B, "Bee");
    await raiseIncoming(result);

    await act(async () => {
      await result.current.accept();
    });

    // I am walking into a different match: no "Bee declined." noise.
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(result.current.outgoing).toBeNull();
    expect(mockAcceptChallenge).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
  });

  it("keeps the prompt when mine could not be withdrawn (network)", async () => {
    mockCancelChallenge.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "network" },
    });
    const { result } = mount();
    await withOutgoing(result, MINE, B);
    await raiseIncoming(result);

    await act(async () => {
      await result.current.accept();
    });

    expect(mockAcceptChallenge).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("Couldn't accept that challenge. Try again.");
    expect(result.current.incoming).not.toBeNull();
    expect(result.current.outgoing?.challengeId).toBe(MINE);
  });
});

describe("crossing challenges (A and B challenge each other)", () => {
  // The lower id is canonical on both clients.
  const LOW = "ch-a";
  const HIGH = "ch-b";

  it("accepts the canonical one straight away, then withdraws my own", async () => {
    const { result } = mount();
    await withOutgoing(result, HIGH, OPPONENT);
    await withIncoming(result, LOW, OPPONENT);

    await act(async () => {
      await result.current.accept();
    });

    // No pre-withdrawal before the accept.
    expect(mockAcceptChallenge).toHaveBeenCalledWith(expect.anything(), {
      challengeId: LOW,
      opponentWeight: 180,
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockCancelChallenge).toHaveBeenCalled());
    expect(mockCancelChallenge.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockAcceptChallenge.mock.invocationCallOrder[0],
    );
    // My own is withdrawn after entry, pending-guarded.
    await waitFor(() =>
      expect(mockCancelChallenge).toHaveBeenCalledWith(expect.anything(), HIGH, {
        onlyIfPending: true,
      }),
    );
    expect(mockDeclineOthers).toHaveBeenCalledWith(expect.anything(), ME, {
      keepChallengeId: LOW,
      exceptChallengerId: OPPONENT,
    });
  });

  it("says nothing when the other side won the canonical row, and joins via its broadcast", async () => {
    mockStartMatch.mockResolvedValue({
      ok: false,
      error: { code: "CHALLENGE_NOT_ACCEPTED", message: "not accepted" },
    });
    const { result } = mount();
    await withOutgoing(result, HIGH, OPPONENT);
    await withIncoming(result, LOW, OPPONENT);

    await act(async () => {
      await result.current.accept();
    });

    expect(mockToastError).not.toHaveBeenCalled();
    expect(result.current.incoming).toBeNull();
    expect(result.current.outgoing?.challengeId).toBe(HIGH);

    const b = mockBindings.find(
      (x) => x.topic === challengeTopic(HIGH) && x.filter.event === "match_started",
    );
    await act(async () => {
      await b?.handler({ payload: { matchId: "m-high" } });
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/match/m-high");
  });

  it("withdraws the canonical one first when my incoming is the other", async () => {
    const { result } = mount();
    await withOutgoing(result, LOW, OPPONENT);
    await withIncoming(result, HIGH, OPPONENT);

    await act(async () => {
      await result.current.accept();
    });

    expect(mockCancelChallenge.mock.calls[0]).toEqual([
      expect.anything(),
      LOW,
      { onlyIfPending: true },
    ]);
    expect(mockAcceptChallenge).toHaveBeenCalledWith(expect.anything(), {
      challengeId: HIGH,
      opponentWeight: 180,
    });
  });

  it("withdraws (never declines) the other half when the canonical one was already accepted", async () => {
    mockCancelChallenge.mockImplementation(async (_c: unknown, id: string) => ({
      ok: true,
      data: { cancelled: id !== LOW },
    }));
    mockGetStatus.mockResolvedValue({ ok: true, data: { status: "accepted", expiresAt: FAR_EXPIRY } });
    const { result } = mount();
    await withOutgoing(result, LOW, OPPONENT);
    await withIncoming(result, HIGH, OPPONENT);

    await act(async () => {
      await result.current.accept();
    });

    expect(mockDeclineChallenge).not.toHaveBeenCalled();
    expect(mockCancelChallenge).toHaveBeenCalledWith(expect.anything(), HIGH, {
      onlyIfPending: true,
    });
    expect(result.current.outgoing?.challengeId).toBe(LOW);
    expect(mockPush).not.toHaveBeenCalled();
  });

  /**
   * Both clients against one fake server: rows, the match table, and
   * broadcasts delivered to whichever instance listens on the topic.
   */
  function fakeServer(x: string, y: string) {
    const rows: Record<string, { status: string; challenger: string; opponent: string }> = {
      [LOW]: { status: "pending", challenger: x, opponent: y },
      [HIGH]: { status: "pending", challenger: y, opponent: x },
    };
    const matches: Record<string, string> = {};
    mockCancelChallenge.mockImplementation(
      async (_c: unknown, id: string, opts?: { onlyIfPending?: boolean }) => {
        const ok = opts?.onlyIfPending
          ? rows[id].status === "pending"
          : ["pending", "accepted"].includes(rows[id].status);
        if (ok) rows[id].status = "cancelled";
        return { ok: true, data: { cancelled: ok } };
      },
    );
    mockAcceptChallenge.mockImplementation(async (_c: unknown, p: { challengeId: string }) => {
      if (rows[p.challengeId].status === "pending") rows[p.challengeId].status = "accepted";
      return { ok: true, data: undefined };
    });
    mockStartMatch.mockImplementation(async (_c: unknown, id: string) => {
      if (matches[id]) {
        return { ok: true, data: { success: true, match_id: matches[id], challenge_id: id } };
      }
      if (rows[id].status !== "accepted") {
        return { ok: false, error: { code: "CHALLENGE_NOT_ACCEPTED", message: "no" } };
      }
      matches[id] = `m-${id}`;
      rows[id].status = "started";
      return { ok: true, data: { success: true, match_id: matches[id], challenge_id: id } };
    });
    mockGetStatus.mockImplementation(async (_c: unknown, id: string) => ({
      ok: true,
      data: { status: rows[id].status, expiresAt: FAR_EXPIRY },
    }));
    mockSend.mockImplementation(
      async (msg: { event: string; payload: unknown }, topic: string) => {
        for (const b of [...mockBindings]) {
          if (b.topic === topic && b.type === "broadcast" && b.filter.event === msg.event) {
            await b.handler({ payload: msg.payload });
          }
        }
        return "ok";
      },
    );
    return { rows, matches };
  }

  async function mountPair() {
    const X = ME;
    const Y = OPPONENT;
    const x = renderHook(() => useArenaChallenge({ athleteId: X, athleteWeight: 180 }));
    const y = renderHook(() => useArenaChallenge({ athleteId: Y, athleteWeight: 180 }));
    // X sent the canonical (lower id) one, Y the other; each has the other's prompt.
    await withOutgoing(x.result, LOW, Y);
    await withIncoming(x.result, HIGH, Y);
    await withOutgoing(y.result, HIGH, X);
    await withIncoming(y.result, LOW, X);
    return { x, y };
  }

  it.each([
    ["X taps first", "x-first"],
    ["Y taps first", "y-first"],
    ["both at once, X's write first", "both-x"],
    ["both at once, Y's write first", "both-y"],
  ])("both land in ONE match: %s", async (_label, order) => {
    const server = fakeServer(ME, OPPONENT);
    const { x, y } = await mountPair();

    await act(async () => {
      if (order === "x-first") {
        await x.result.current.accept();
        await y.result.current.accept();
      } else if (order === "y-first") {
        await y.result.current.accept();
        await x.result.current.accept();
      } else if (order === "both-x") {
        await Promise.all([x.result.current.accept(), y.result.current.accept()]);
      } else {
        await Promise.all([y.result.current.accept(), x.result.current.accept()]);
      }
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(2));
    const hrefs = mockPush.mock.calls.map((c) => c[0]);
    expect(new Set(hrefs).size).toBe(1);
    expect(Object.keys(server.matches)).toHaveLength(1);
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe("a backgrounded challenger catches up on return", () => {
  let handlers: Array<(s: string) => void> = [];
  function appState(s: string) {
    handlers.forEach((h) => h(s));
  }
  beforeEach(() => {
    handlers = [];
    const { AppState } = jest.requireActual("react-native") as typeof import("react-native");
    jest.spyOn(AppState, "addEventListener").mockImplementation(((
      _e: string,
      handler: (s: string) => void,
    ) => {
      handlers.push(handler);
      return { remove: jest.fn() };
    }) as never);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("joins the match on foreground when it started while suspended", async () => {
    const { result } = mount();
    await sendOne(result);
    mockGetStatus.mockResolvedValue({ ok: true, data: { status: "started", expiresAt: FAR_EXPIRY } });

    await act(async () => {
      appState("background");
      appState("active");
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`));
    expect(mockGetStatus).toHaveBeenCalledWith(expect.anything(), CHALLENGE);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("does not re-read on an 'active' that was not a return from background", async () => {
    const { result } = mount();
    await sendOne(result);
    await act(async () => {
      appState("inactive");
      appState("active");
    });
    expect(mockGetStatus).not.toHaveBeenCalled();
  });

  it("does not start a challenge that is only accepted (jits-njyd)", async () => {
    const { result } = mount();
    await sendOne(result);
    mockGetStatus.mockResolvedValue({ ok: true, data: { status: "accepted", expiresAt: FAR_EXPIRY } });

    await act(async () => {
      appState("background");
      appState("active");
    });

    await waitFor(() => expect(mockGetStatus).toHaveBeenCalled());
    expect(mockStartMatch).not.toHaveBeenCalled();
    expect(result.current.outgoing).not.toBeNull();
  });

  it.each([
    ["declined", "Rival declined."],
    ["expired", "Your challenge to Rival expired."],
    ["cancelled", null],
  ])("clears the plate on foreground when it was %s", async (status, message) => {
    const { result } = mount();
    await sendOne(result);
    mockGetStatus.mockResolvedValue({ ok: true, data: { status, expiresAt: FAR_EXPIRY } });

    await act(async () => {
      appState("background");
      appState("active");
    });

    await waitFor(() => expect(result.current.outgoing).toBeNull());
    if (message) expect(mockToastInfo).toHaveBeenCalledWith(message);
    else expect(mockToastInfo).not.toHaveBeenCalled();
  });

  it("re-reads when the outgoing channel reaches SUBSCRIBED", async () => {
    const { result } = mount();
    await sendOne(result);
    mockGetStatus.mockResolvedValue({ ok: true, data: { status: "started", expiresAt: FAR_EXPIRY } });
    const ch = mockBuilt.find((c) => c.topic === challengeTopic(CHALLENGE));

    await act(async () => {
      ch?.statusCb?.("SUBSCRIBED");
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`));
  });

  it("re-reads a plate left up when a match ends", async () => {
    const { result, rerender } = renderHook(
      ({ inMatch }: { inMatch: boolean }) =>
        useArenaChallenge({ athleteId: ME, athleteWeight: 180, inMatch }),
      { initialProps: { inMatch: false } },
    );
    await sendOne(result);
    rerender({ inMatch: true });
    mockGetStatus.mockClear();
    await act(async () => {
      rerender({ inMatch: false });
    });
    expect(mockGetStatus).toHaveBeenCalledWith(expect.anything(), CHALLENGE);
  });
});

/** A plate for "ch-other" put up by a send (restore is refused mid-entry). */
async function sendOther(result: { current: ReturnType<typeof useArenaChallenge> }) {
  mockCreateChallenge.mockResolvedValueOnce({
    ok: true,
    data: { id: "ch-other", expiresAt: FAR_EXPIRY },
  });
  await act(async () => {
    await result.current.sendChallenge("opp-9", "Nine");
  });
  expect(result.current.outgoing?.challengeId).toBe("ch-other");
}

describe("one client never pushes two match screens", () => {
  it("refuses a second entry for a DIFFERENT challenge before the first screen mounts", async () => {
    const { result } = mount();
    await raiseIncoming(result);
    await act(async () => {
      await result.current.accept();
    });
    expect(mockPush).toHaveBeenCalledTimes(1);

    // A late broadcast for some other challenge of mine.
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await sendOther(result);
    const b = mockBindings.find(
      (x) => x.topic === challengeTopic("ch-other") && x.filter.event === "match_started",
    );
    await act(async () => {
      await b?.handler({ payload: { matchId: "match-other" } });
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });

  it("refuses entry while a match screen is up", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() =>
      useArenaChallenge({ athleteId: ME, athleteWeight: 180, inMatch: true }),
    );
    await sendOther(result);
    const b = mockBindings.find(
      (x) => x.topic === challengeTopic("ch-other") && x.filter.event === "match_started",
    );
    await act(async () => {
      await b?.handler({ payload: { matchId: "match-other" } });
    });
    expect(mockPush).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

describe("channels the server closed are rebuilt (jits-fa9x pattern)", () => {
  let handlers: Array<(s: string) => void> = [];
  beforeEach(() => {
    jest.useFakeTimers();
    handlers = [];
    const { AppState } = jest.requireActual("react-native") as typeof import("react-native");
    jest.spyOn(AppState, "addEventListener").mockImplementation(((
      _e: string,
      handler: (s: string) => void,
    ) => {
      handlers.push(handler);
      return { remove: jest.fn() };
    }) as never);
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const incomingChannels = () =>
    mockBuilt.filter((c) => c.topic.startsWith(`arena-incoming:${ME}:`));

  /** The server closes it: realtime-js drops it from the registry, then CLOSED. */
  function serverClose(ch: MockChannel) {
    const i = mockRegistered.indexOf(ch);
    if (i >= 0) mockRegistered.splice(i, 1);
    act(() => {
      ch.statusCb?.("CLOSED");
    });
  }

  it("rebuilds the incoming channel after a server close, without touching the dead one", async () => {
    mount();
    const [first] = incomingChannels();
    act(() => first.statusCb?.("SUBSCRIBED"));
    expect(mockResync).not.toHaveBeenCalled();

    serverClose(first);
    expect(incomingChannels()).toHaveLength(1);
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });

    const all = incomingChannels();
    expect(all).toHaveLength(2);
    expect(all[1].topic).not.toBe(first.topic);
    expect(mockRemoveChannel).not.toHaveBeenCalledWith(first);

    // Missed INSERTs are recovered by a pending re-read once it is back.
    act(() => all[1].statusCb?.("SUBSCRIBED"));
    expect(mockResync).toHaveBeenCalledTimes(1);

    // And the rebuilt channel carries the bindings.
    const insert = mockBindings.find(
      (b) => b.topic === all[1].topic && b.filter.event === "INSERT",
    );
    expect(insert).toBeDefined();
  });

  it("ignores CLOSED / CHANNEL_ERROR on an instance that is still registered", async () => {
    mount();
    const [first] = incomingChannels();
    act(() => {
      first.statusCb?.("CHANNEL_ERROR");
      first.statusCb?.("CLOSED");
    });
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(incomingChannels()).toHaveLength(1);
  });

  it("backs off 1s, 5s, 15s, 30s, then waits for the foreground", async () => {
    mount();
    const delays = [1_000, 5_000, 15_000, 30_000];
    for (let i = 0; i < delays.length; i++) {
      serverClose(incomingChannels()[i]);
      await act(async () => {
        jest.advanceTimersByTime(delays[i] - 1);
      });
      expect(incomingChannels()).toHaveLength(i + 1);
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(incomingChannels()).toHaveLength(i + 2);
    }

    serverClose(incomingChannels()[4]);
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    expect(incomingChannels()).toHaveLength(5);

    act(() => handlers.forEach((h) => h("active")));
    expect(incomingChannels()).toHaveLength(6);
  });

  it("does not rebuild after unmount", async () => {
    const { unmount } = mount();
    const [first] = incomingChannels();
    serverClose(first);
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(incomingChannels()).toHaveLength(1);
  });

  it("rebuilds my outgoing channel and re-reads the plate once it is back", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.sendChallenge(OPPONENT, "Rival");
    });
    const outgoing = () => mockBuilt.filter((c) => c.topic === challengeTopic(CHALLENGE));
    const [first] = outgoing();
    serverClose(first);
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(outgoing()).toHaveLength(2);

    mockGetStatus.mockResolvedValue({ ok: true, data: { status: "started", expiresAt: FAR_EXPIRY } });
    await act(async () => {
      outgoing()[1].statusCb?.("SUBSCRIBED");
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
  });
});

describe("my own accept landing on the prompt's UPDATE", () => {
  it("does not re-read pending (it would raise the next prompt under the navigation)", async () => {
    const { result } = mount();
    await raiseIncoming(result);
    await act(async () => {
      await opponentUpdateBinding().handler({
        new: { id: CHALLENGE, challenger_id: OPPONENT, opponent_id: ME, status: "accepted" },
      });
    });
    expect(mockResync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Review follow-ups (liveness)
// ---------------------------------------------------------------------------

async function flushAsync() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("accept succeeded but the start did not (review item 1a)", () => {
  const networkError = { ok: false, error: { code: "UNKNOWN", message: "network" } };

  it("retries the start once, then withdraws the accepted row so the challenger's plate clears", async () => {
    mockStartMatch.mockResolvedValue(networkError);
    const { result } = mount();
    await raiseIncoming(result);

    await act(async () => {
      await result.current.accept();
    });

    expect(mockStartMatch).toHaveBeenCalledTimes(2);
    // No onlyIfPending: `challenges_update_cancel` allows `accepted`.
    expect(mockCancelChallenge).toHaveBeenCalledWith(expect.anything(), CHALLENGE);
    expect(mockToastError).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(result.current.incoming).toBeNull();
  });

  it("recovers when the start had landed and only its reply was lost", async () => {
    mockStartMatch
      .mockResolvedValueOnce(networkError)
      .mockResolvedValueOnce(networkError)
      .mockResolvedValue({
        ok: true,
        data: { success: true, match_id: MATCH, challenge_id: CHALLENGE },
      });
    // Not `accepted` any more (it is `started`): nothing to withdraw.
    mockCancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: false } });
    const { result } = mount();
    await raiseIncoming(result);

    await act(async () => {
      await result.current.accept();
    });

    expect(mockStartMatch).toHaveBeenCalledTimes(3);
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
  });

  it("does not withdraw a challenge that is simply dead (not_accepted)", async () => {
    mockStartMatch.mockResolvedValue({
      ok: false,
      error: { code: "CHALLENGE_NOT_ACCEPTED", message: "no" },
    });
    const { result } = mount();
    await raiseIncoming(result);
    await act(async () => {
      await result.current.accept();
    });
    expect(mockCancelChallenge).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("That challenge is no longer available.");
  });
});

describe("the challenger's safety net for a row stuck at 'accepted' (review item 1b)", () => {
  let handlers: Array<(s: string) => void> = [];
  beforeEach(() => {
    jest.useFakeTimers();
    handlers = [];
    const { AppState } = jest.requireActual("react-native") as typeof import("react-native");
    jest.spyOn(AppState, "addEventListener").mockImplementation(((
      _e: string,
      handler: (s: string) => void,
    ) => {
      handlers.push(handler);
      return { remove: jest.fn() };
    }) as never);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function acceptedUpdate() {
    await act(async () => {
      await challengerUpdateBinding().handler({
        new: { id: CHALLENGE, challenger_id: ME, opponent_id: OPPONENT, status: "accepted" },
      });
    });
  }

  it("starts the match itself when the row is still 'accepted' 12s later", async () => {
    const { result } = mount();
    await sendOne(result);
    await acceptedUpdate();
    mockGetStatus.mockResolvedValue({ ok: true, data: { status: "accepted", expiresAt: FAR_EXPIRY } });

    await act(async () => {
      jest.advanceTimersByTime(11_999);
      await flushAsync();
    });
    expect(mockStartMatch).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
      await flushAsync();
    });
    expect(mockStartMatch).toHaveBeenCalledWith(expect.anything(), CHALLENGE);
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
  });

  it("does nothing extra when the accepter's broadcast arrived in time", async () => {
    const { result } = mount();
    await sendOne(result);
    await acceptedUpdate();
    const b = mockBindings.find(
      (x) => x.topic === challengeTopic(CHALLENGE) && x.filter.event === "match_started",
    );
    await act(async () => {
      await b?.handler({ payload: { matchId: MATCH } });
    });
    await act(async () => {
      jest.advanceTimersByTime(20_000);
      await flushAsync();
    });
    expect(mockGetStatus).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("clears the plate if the accepter withdrew it meanwhile", async () => {
    const { result } = mount();
    await sendOne(result);
    await acceptedUpdate();
    mockGetStatus.mockResolvedValue({ ok: true, data: { status: "cancelled", expiresAt: FAR_EXPIRY } });
    await act(async () => {
      jest.advanceTimersByTime(12_000);
      await flushAsync();
    });
    expect(mockStartMatch).not.toHaveBeenCalled();
    expect(result.current.outgoing).toBeNull();
  });

  it("is also armed by a foreground re-read that finds 'accepted'", async () => {
    const { result } = mount();
    await sendOne(result);
    mockGetStatus.mockResolvedValue({ ok: true, data: { status: "accepted", expiresAt: FAR_EXPIRY } });
    await act(async () => {
      handlers.forEach((h) => h("background"));
      handlers.forEach((h) => h("active"));
      await flushAsync();
    });
    expect(mockStartMatch).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(12_000);
      await flushAsync();
    });
    expect(mockPush).toHaveBeenCalledWith(`/match/${MATCH}`);
  });

  it("is armed by the accept-while-outgoing 'accepted' wait path", async () => {
    mockCancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: false } });
    mockGetStatus.mockResolvedValue({ ok: true, data: { status: "accepted", expiresAt: FAR_EXPIRY } });
    mockStartMatch.mockResolvedValue({
      ok: true,
      data: { success: true, match_id: "match-mine", challenge_id: "ch-mine" },
    });
    const { result } = mount();
    await withOutgoing(result, "ch-mine", "opp-b");
    await raiseIncoming(result);
    await act(async () => {
      await result.current.accept();
    });
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(12_000);
      await flushAsync();
    });
    expect(mockStartMatch).toHaveBeenCalledWith(expect.anything(), "ch-mine");
    expect(mockPush).toHaveBeenCalledWith("/match/match-mine");
  });

  it("is cancelled on unmount", async () => {
    const { result, unmount } = mount();
    await sendOne(result);
    await acceptedUpdate();
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(20_000);
      await flushAsync();
    });
    expect(mockGetStatus).not.toHaveBeenCalled();
  });
});

describe("an INSERT while I am busy is declined, not ignored (review item 2)", () => {
  it("declines and tells the challenger when I am in a match", async () => {
    const { result } = renderHook(() =>
      useArenaChallenge({ athleteId: ME, athleteWeight: 180, inMatch: true }),
    );
    mockCalls.length = 0;
    await act(async () => {
      await incomingBinding().handler({
        new: { id: "ch-late", challenger_id: "opp-late", opponent_id: ME, status: "pending" },
      });
      await flushAsync();
    });

    expect(result.current.incoming).toBeNull();
    expect(mockDeclineChallenge).toHaveBeenCalledWith(expect.anything(), "ch-late");
    expect(mockCalls).toEqual(["send:declined"]);
  });

  it("declines one that lands in the moment between accept and the match screen", async () => {
    const { result } = mount();
    await raiseIncoming(result);
    await act(async () => {
      await result.current.accept();
    });
    mockDeclineChallenge.mockClear();

    await act(async () => {
      await incomingBinding().handler({
        new: { id: "ch-late", challenger_id: "opp-late", opponent_id: ME, status: "pending" },
      });
      await flushAsync();
    });
    expect(mockDeclineChallenge).toHaveBeenCalledWith(expect.anything(), "ch-late");
    expect(result.current.incoming).toBeNull();
  });

  it("still only ignores (never declines) one that lands while another prompt is up", async () => {
    const { result } = mount();
    await raiseIncoming(result);
    await act(async () => {
      await incomingBinding().handler({
        new: { id: "ch-2", challenger_id: "opp-2", opponent_id: ME, status: "pending" },
      });
    });
    expect(mockDeclineChallenge).not.toHaveBeenCalled();
    expect(result.current.incoming?.challengeId).toBe(CHALLENGE);
  });
});

describe("every re-subscribe of the incoming channel re-reads (review item 4)", () => {
  it("re-reads pending on a phoenix rejoin, not on the first SUBSCRIBED", async () => {
    mount();
    const [ch] = mockBuilt.filter((c) => c.topic.startsWith(`arena-incoming:${ME}:`));
    act(() => ch.statusCb?.("SUBSCRIBED"));
    expect(mockResync).not.toHaveBeenCalled();

    // A network blip: CHANNEL_ERROR, the instance stays registered, phoenix
    // rejoins it, SUBSCRIBED again.
    act(() => {
      ch.statusCb?.("CHANNEL_ERROR");
      ch.statusCb?.("SUBSCRIBED");
    });
    expect(mockResync).toHaveBeenCalledTimes(1);
  });
});

describe("restoreOutgoing is refused mid-accept or mid-entry (review item 7)", () => {
  it("does not resurrect a plate while an accept is running", async () => {
    let finishAccept!: () => void;
    mockAcceptChallenge.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAccept = () => resolve({ ok: true, data: undefined });
        }),
    );
    const { result } = mount();
    await raiseIncoming(result);

    let accepting!: Promise<void>;
    act(() => {
      accepting = result.current.accept();
    });
    act(() => {
      result.current.restoreOutgoing({
        challengeId: "ch-old",
        opponentId: "opp-9",
        opponentName: "Nine",
        expiresAt: FAR_EXPIRY,
      });
    });
    expect(result.current.outgoing).toBeNull();

    await act(async () => {
      finishAccept();
      await accepting;
    });
  });

  it("does not resurrect a plate on the way into a match", async () => {
    const { result } = mount();
    await raiseIncoming(result);
    await act(async () => {
      await result.current.accept();
    });
    act(() => {
      result.current.restoreOutgoing({
        challengeId: "ch-old",
        opponentId: "opp-9",
        opponentName: "Nine",
        expiresAt: FAR_EXPIRY,
      });
    });
    expect(result.current.outgoing).toBeNull();
  });
});
