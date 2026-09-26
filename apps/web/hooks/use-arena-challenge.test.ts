import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  CHALLENGE_CAP_MESSAGE,
  CHALLENGE_SEND_FAILED_MESSAGE,
  opponentLeftMessage,
  useArenaChallenge,
} from "./use-arena-challenge";

type Handler = (payload: unknown) => unknown;
interface FakeChannel {
  topic: string;
  handlers: { type: string; filter: Record<string, string>; fn: Handler }[];
  sent: { event: string; payload: unknown }[];
  on: (type: string, filter: Record<string, string>, fn: Handler) => FakeChannel;
  subscribe: () => FakeChannel;
  send: (m: { event: string; payload: unknown }) => Promise<string>;
}

const rt = vi.hoisted(() => ({
  channels: [] as FakeChannel[],
  removed: [] as FakeChannel[],
  /** Overrides the challenger lookup, e.g. to hold it open. */
  lookup: null as null | (() => Promise<unknown>),
  /** The opponent row read when an insert is refused. */
  opponent: { data: { looking_for_ranked: true, status: "active" }, error: null } as {
    data: null | { looking_for_ranked: boolean; status: string };
    error: null | { message: string };
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (topic: string) => {
      const ch: FakeChannel = {
        topic,
        handlers: [],
        sent: [],
        on(type, filter, fn) {
          ch.handlers.push({ type, filter, fn });
          return ch;
        },
        subscribe: () => ch,
        send: async (m) => {
          ch.sent.push({ event: m.event, payload: m.payload });
          return "ok";
        },
      };
      rt.channels.push(ch);
      return ch;
    },
    removeChannel: async (ch: FakeChannel) => {
      rt.removed.push(ch);
    },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        single: () =>
          rt.lookup ? rt.lookup() : Promise.resolve({ data: { display_name: "Ana" } }),
        maybeSingle: () => Promise.resolve(rt.opponent),
      };
      return q;
    },
  }),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const toast = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const m = vi.hoisted(() => ({
  acceptChallenge: vi.fn(),
  cancelChallenge: vi.fn(),
  cancelStaleOutgoingChallenges: vi.fn(),
  createChallenge: vi.fn(),
  declineChallenge: vi.fn(),
  declineOtherPendingChallenges: vi.fn(),
  startMatchFromChallenge: vi.fn(),
}));
vi.mock("@jits/shared/api/mutations", () => m);
const q = vi.hoisted(() => ({ getPendingChallengesForAthlete: vi.fn() }));
vi.mock("@jits/shared/api/queries", () => q);

/** A pending challenge row as `getPendingChallengesForAthlete` returns it. */
function pending(
  id: string,
  over: Partial<{ challengerId: string; opponentId: string; opponentName: string; ageMs: number }> = {},
) {
  return {
    challengeId: id,
    challengerId: over.challengerId ?? "me",
    opponentId: over.opponentId ?? "ana",
    challengerName: "Me",
    opponentName: over.opponentName ?? "Ana",
    matchType: "ranked",
    createdAt: new Date(Date.now() - (over.ageMs ?? 60_000)).toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    challengerWeight: null,
    opponentWeight: null,
  };
}

const live = (topic: string) =>
  rt.channels.filter((c) => c.topic === topic && !rt.removed.includes(c));
const incomingChannel = () => live("arena-incoming:me")[0];
function fire(
  ch: FakeChannel,
  type: string,
  event: string,
  payload: unknown,
  side: "opponent" | "challenger" = "opponent",
) {
  const h = ch.handlers.find(
    (x) =>
      x.type === type &&
      x.filter.event === event &&
      (type !== "postgres_changes" || x.filter.filter.startsWith(side)),
  );
  return h!.fn(payload);
}
async function challengerUpdate(id: string, status: string) {
  await act(async () => {
    await fire(incomingChannel(), "postgres_changes", "UPDATE", { new: { id, status } }, "challenger");
  });
}
async function insertChallenge(id = "c1") {
  await act(async () => {
    await fire(incomingChannel(), "postgres_changes", "INSERT", {
      new: { id, challenger_id: "ana", status: "pending" },
    });
  });
}

beforeEach(() => {
  rt.channels = [];
  rt.removed = [];
  rt.lookup = null;
  rt.opponent = { data: { looking_for_ranked: true, status: "active" }, error: null };
  vi.clearAllMocks();
  m.acceptChallenge.mockResolvedValue({ ok: true, data: null });
  m.declineChallenge.mockResolvedValue({ ok: true, data: null });
  m.cancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: true } });
  m.createChallenge.mockResolvedValue({ ok: true, data: { id: "out1" } });
  m.startMatchFromChallenge.mockResolvedValue({ ok: true, data: { match_id: "m1" } });
  m.cancelStaleOutgoingChallenges.mockResolvedValue({ ok: true, data: { cancelled: [] } });
  m.declineOtherPendingChallenges.mockResolvedValue({
    ok: true,
    data: { declined: [], skipped: [] },
  });
  q.getPendingChallengesForAthlete.mockResolvedValue({
    ok: true,
    data: { incoming: [], outgoing: [] },
  });
});

function mount(canReceive = true, inMatch = false) {
  return renderHook(
    ({ canReceive, inMatch }: { canReceive: boolean; inMatch?: boolean }) =>
      useArenaChallenge({ athleteId: "me", athleteWeight: 170, canReceive, inMatch }),
    { initialProps: { canReceive, inMatch } as { canReceive: boolean; inMatch?: boolean } },
  );
}

describe("useArenaChallenge", () => {
  it("raises the prompt for a pending challenge while live", async () => {
    const { result } = mount(true);
    await insertChallenge();
    expect(result.current.incoming).toEqual({
      challengeId: "c1",
      challengerId: "ana",
      challengerName: "Ana",
    });
  });

  it("ignores challenges while not live (e.g. profile ChallengeSheet rows)", async () => {
    const { result } = mount(false);
    await insertChallenge();
    expect(result.current.incoming).toBeNull();
  });

  it("drops an open prompt when the athlete goes offline or enters a match", async () => {
    const { result, rerender } = mount(true);
    await insertChallenge();
    rerender({ canReceive: false });
    expect(result.current.incoming).toBeNull();
    expect(m.declineChallenge).not.toHaveBeenCalled();
  });

  it("drops an INSERT when the athlete goes offline during the challenger lookup (jits-dwq1)", async () => {
    let release!: (v: unknown) => void;
    rt.lookup = () => new Promise((r) => (release = r));
    const { result, rerender } = mount(true);
    let pending!: Promise<unknown>;
    act(() => {
      pending = fire(incomingChannel(), "postgres_changes", "INSERT", {
        new: { id: "c1", challenger_id: "ana", status: "pending" },
      }) as Promise<unknown>;
    });
    rerender({ canReceive: false });
    await act(async () => {
      release({ data: { display_name: "Ana" } });
      await pending;
    });
    expect(result.current.incoming).toBeNull();
  });

  it("clears the prompt when its row stops being pending", async () => {
    const { result } = mount(true);
    await insertChallenge();
    act(() => {
      fire(incomingChannel(), "postgres_changes", "UPDATE", {
        new: { id: "other", status: "cancelled" },
      });
    });
    expect(result.current.incoming).not.toBeNull();
    act(() => {
      fire(incomingChannel(), "postgres_changes", "UPDATE", {
        new: { id: "c1", status: "cancelled" },
      });
    });
    expect(result.current.incoming).toBeNull();
  });

  it("clears the prompt on the challenger's cancelled broadcast", async () => {
    const { result } = mount(true);
    await insertChallenge();
    const [ch] = live("arena-challenge:c1");
    act(() => {
      fire(ch, "broadcast", "cancelled", {});
    });
    expect(result.current.incoming).toBeNull();
    expect(rt.removed).toContain(ch);
  });

  it("clears the prompt and toasts when starting the match fails", async () => {
    m.startMatchFromChallenge.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "nope" },
    });
    const { result } = mount(true);
    await insertChallenge();
    await act(() => result.current.accept());
    expect(toast.error).toHaveBeenCalledWith("nope");
    expect(result.current.incoming).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("accept broadcasts match_started on the challenge channel and enters the match", async () => {
    const { result } = mount(true);
    await insertChallenge();
    const [ch] = live("arena-challenge:c1");
    await act(() => result.current.accept());
    expect(ch.sent).toEqual([{ event: "match_started", payload: { matchId: "m1" } }]);
    expect(push).toHaveBeenCalledWith("/arena/match/m1");
    // The per-challenge channel is torn down once the prompt is gone.
    expect(live("arena-challenge:c1")).toHaveLength(0);
  });

  it("decline broadcasts declined and removes the channel", async () => {
    const { result } = mount(true);
    await insertChallenge();
    await act(() => result.current.decline());
    const sent = rt.channels
      .filter((c) => c.topic === "arena-challenge:c1")
      .flatMap((c) => c.sent);
    expect(sent).toEqual([{ event: "declined", payload: {} }]);
    expect(live("arena-challenge:c1")).toHaveLength(0);
    expect(result.current.incoming).toBeNull();
  });

  it("cancelOutgoing broadcasts cancelled to the recipient", async () => {
    const { result } = mount(true);
    await act(() => result.current.sendChallenge("ana", "Ana"));
    expect(result.current.outgoing?.challengeId).toBe("out1");
    await act(() => result.current.cancelOutgoing());
    const sent = rt.channels
      .filter((c) => c.topic === "arena-challenge:out1")
      .flatMap((c) => c.sent);
    expect(sent).toEqual([{ event: "cancelled", payload: {} }]);
    expect(m.cancelChallenge).toHaveBeenCalled();
    expect(result.current.outgoing).toBeNull();
    expect(live("arena-challenge:out1")).toHaveLength(0);
  });

  describe("cancelling a challenge that is already over (0 rows changed)", () => {
    beforeEach(() => {
      m.cancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: false } });
    });

    it("joins the match the opponent already started, without broadcasting cancelled", async () => {
      const { result } = mount(true);
      await act(() => result.current.sendChallenge("ana", "Ana"));
      m.startMatchFromChallenge.mockResolvedValue({ ok: true, data: { match_id: "m7" } });
      await act(() => result.current.cancelOutgoing());
      expect(m.startMatchFromChallenge).toHaveBeenCalledWith(expect.anything(), "out1");
      expect(push).toHaveBeenCalledWith("/arena/match/m7");
      expect(rt.channels.flatMap((c) => c.sent)).toEqual([]);
      expect(result.current.outgoing).toBeNull();
    });

    it("just drops the bar when there is no match to join", async () => {
      const { result } = mount(true);
      await act(() => result.current.sendChallenge("ana", "Ana"));
      m.startMatchFromChallenge.mockResolvedValue({
        ok: false,
        error: { code: "CHALLENGE_NOT_ACCEPTED", message: "x" },
      });
      await act(() => result.current.cancelOutgoing());
      expect(push).not.toHaveBeenCalled();
      expect(rt.channels.flatMap((c) => c.sent)).toEqual([]);
      expect(result.current.outgoing).toBeNull();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("accepting another challenge does not broadcast a cancel for an already-over one", async () => {
      const { result } = mount(true);
      await act(() => result.current.sendChallenge("bo", "Bo"));
      await insertChallenge("c1");
      await act(() => result.current.accept());
      expect(push).toHaveBeenCalledWith("/arena/match/m1");
      expect(m.cancelChallenge).toHaveBeenCalledWith(expect.anything(), "out1");
      const sent = rt.channels
        .filter((c) => c.topic === "arena-challenge:out1")
        .flatMap((c) => c.sent);
      expect(sent).toEqual([]);
    });
  });

  describe("outgoing resolved by the challenger-side UPDATE (no broadcast)", () => {
    async function sent() {
      const hook = mount(true);
      await act(() => hook.result.current.sendChallenge("ana", "Ana"));
      expect(hook.result.current.outgoing?.challengeId).toBe("out1");
      return hook;
    }

    it("declined clears the bar and toasts", async () => {
      const { result } = await sent();
      await challengerUpdate("out1", "declined");
      expect(result.current.outgoing).toBeNull();
      expect(toast.info).toHaveBeenCalledWith("Ana declined.");
    });

    it.each(["cancelled", "expired"])("%s clears the bar without a toast", async (status) => {
      const { result } = await sent();
      await challengerUpdate("out1", status);
      expect(result.current.outgoing).toBeNull();
      expect(toast.info).not.toHaveBeenCalled();
    });

    it("accepted is ignored: the accepter is creating the match", async () => {
      const { result } = await sent();
      await challengerUpdate("out1", "accepted");
      expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(result.current.outgoing?.challengeId).toBe("out1");
    });

    it.each(["started"])(
      "%s fetches the existing match and enters it once",
      async (status) => {
        const { result } = await sent();
        await challengerUpdate("out1", status);
        expect(m.startMatchFromChallenge).toHaveBeenCalledWith(expect.anything(), "out1");
        expect(push).toHaveBeenCalledWith("/arena/match/m1");
        expect(result.current.outgoing).toBeNull();
        // The late broadcast for the same challenge does not navigate again.
        const [ch] = rt.channels.filter((c) => c.topic === "arena-challenge:out1");
        act(() => {
          fire(ch, "broadcast", "match_started", { payload: { matchId: "m1" } });
        });
        expect(push).toHaveBeenCalledTimes(1);
      },
    );

    it("ignores updates for other challenges and pending rows", async () => {
      const { result } = await sent();
      await challengerUpdate("someone-else", "declined");
      await challengerUpdate("out1", "pending");
      expect(result.current.outgoing?.challengeId).toBe("out1");
      expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
    });

    it("declined broadcast then UPDATE toasts only once", async () => {
      await sent();
      const [ch] = live("arena-challenge:out1");
      act(() => {
        fire(ch, "broadcast", "declined", {});
      });
      await challengerUpdate("out1", "declined");
      expect(toast.info).toHaveBeenCalledTimes(1);
    });
  });

  it("does not drop the prompt on its own accepted UPDATE mid-accept", async () => {
    let finishAccept!: (v: unknown) => void;
    m.acceptChallenge.mockReturnValue(new Promise((r) => (finishAccept = r)));
    const { result } = mount(true);
    await insertChallenge();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.accept();
    });
    act(() => {
      fire(incomingChannel(), "postgres_changes", "UPDATE", {
        new: { id: "c1", status: "accepted" },
      });
    });
    expect(result.current.incoming?.challengeId).toBe("c1");
    await act(async () => {
      finishAccept({ ok: true, data: null });
      await pending;
    });
    expect(push).toHaveBeenCalledWith("/arena/match/m1");
  });

  it("keeps the first open prompt when a second challenge arrives", async () => {
    const { result } = mount(true);
    await insertChallenge("c1");
    await insertChallenge("c2");
    expect(result.current.incoming?.challengeId).toBe("c1");
  });

  describe("failure handling", () => {
    it("retries start_match_from_challenge once before giving up", async () => {
      m.startMatchFromChallenge
        .mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "blip" } })
        .mockResolvedValueOnce({ ok: true, data: { match_id: "m1" } });
      const { result } = mount(true);
      await insertChallenge();
      await act(() => result.current.accept());
      expect(m.startMatchFromChallenge).toHaveBeenCalledTimes(2);
      expect(push).toHaveBeenCalledWith("/arena/match/m1");
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("gives up after the retry fails", async () => {
      m.startMatchFromChallenge.mockResolvedValue({
        ok: false,
        error: { code: "UNKNOWN", message: "down" },
      });
      const { result } = mount(true);
      await insertChallenge();
      await act(() => result.current.accept());
      expect(m.startMatchFromChallenge).toHaveBeenCalledTimes(2);
      expect(toast.error).toHaveBeenCalledWith("down");
      expect(result.current.incoming).toBeNull();
    });

    it("maps not_accepted to 'no longer available' without retrying", async () => {
      m.startMatchFromChallenge.mockResolvedValue({
        ok: false,
        error: { code: "CHALLENGE_NOT_ACCEPTED", message: "raw" },
      });
      const { result } = mount(true);
      await insertChallenge();
      await act(() => result.current.accept());
      expect(m.startMatchFromChallenge).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith("That challenge is no longer available.");
    });

    it("maps not_accepted from acceptChallenge too", async () => {
      m.acceptChallenge.mockResolvedValue({
        ok: false,
        error: { code: "CHALLENGE_NOT_ACCEPTED", message: "raw" },
      });
      const { result } = mount(true);
      await insertChallenge();
      await act(() => result.current.accept());
      expect(toast.error).toHaveBeenCalledWith("That challenge is no longer available.");
      expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
    });

    it("a failed decline keeps the prompt, toasts, and broadcasts nothing", async () => {
      m.declineChallenge.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
      const { result } = mount(true);
      await insertChallenge();
      await act(() => result.current.decline());
      expect(result.current.incoming?.challengeId).toBe("c1");
      expect(toast.error).toHaveBeenCalledWith("Couldn't decline that challenge. Try again.");
      expect(rt.channels.flatMap((c) => c.sent)).toEqual([]);
    });

    it("a failed cancel keeps the waiting bar, toasts, and broadcasts nothing", async () => {
      m.cancelChallenge.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
      const { result } = mount(true);
      await act(() => result.current.sendChallenge("ana", "Ana"));
      await act(() => result.current.cancelOutgoing());
      expect(result.current.outgoing?.challengeId).toBe("out1");
      expect(toast.error).toHaveBeenCalledWith("Couldn't cancel that challenge. Try again.");
      expect(rt.channels.flatMap((c) => c.sent)).toEqual([]);
    });
  });

  it("accepting an incoming challenge withdraws my own pending one", async () => {
    const { result } = mount(true);
    await act(() => result.current.sendChallenge("bo", "Bo"));
    await insertChallenge("c1");
    await act(() => result.current.accept());
    expect(push).toHaveBeenCalledWith("/arena/match/m1");
    expect(m.cancelChallenge).toHaveBeenCalledWith(expect.anything(), "out1");
    const sent = rt.channels
      .filter((c) => c.topic === "arena-challenge:out1")
      .flatMap((c) => c.sent);
    expect(sent).toEqual([{ event: "cancelled", payload: {} }]);
    expect(result.current.outgoing).toBeNull();
  });

  it("entering the match for my own outgoing challenge does not cancel it", async () => {
    const { result } = mount(true);
    await act(() => result.current.sendChallenge("ana", "Ana"));
    const [ch] = live("arena-challenge:out1");
    await act(async () => {
      fire(ch, "broadcast", "match_started", { payload: { matchId: "m9" } });
    });
    expect(push).toHaveBeenCalledWith("/arena/match/m9");
    expect(m.cancelChallenge).not.toHaveBeenCalled();
    expect(result.current.outgoing).toBeNull();
  });

  describe("stale outgoing challenges must not hold the cap (jits-celf)", () => {
    const CAPPED = {
      ok: false,
      error: { code: "MAX_PENDING_CHALLENGES", message: "3 pending" },
    };
    const flush = () => act(async () => {});

    it("withdraws stale ones on mount and again on going live", async () => {
      const { rerender } = mount(false);
      await flush();
      expect(m.cancelStaleOutgoingChallenges).toHaveBeenCalledTimes(1);
      expect(m.cancelStaleOutgoingChallenges).toHaveBeenCalledWith(
        expect.anything(),
        "me",
        expect.objectContaining({ keepChallengeId: null }),
      );

      rerender({ canReceive: true });
      await flush();
      expect(m.cancelStaleOutgoingChallenges).toHaveBeenCalledTimes(2);
    });

    it("withdraws stale ones when the tab becomes visible again", async () => {
      mount(true);
      await flush();
      m.cancelStaleOutgoingChallenges.mockClear();

      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(m.cancelStaleOutgoingChallenges).toHaveBeenCalledTimes(1);
    });

    it("keeps the challenge on my waiting bar", async () => {
      const { result } = mount(true);
      await act(() => result.current.sendChallenge("ana", "Ana"));
      m.cancelStaleOutgoingChallenges.mockClear();

      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(m.cancelStaleOutgoingChallenges).toHaveBeenCalledWith(
        expect.anything(),
        "me",
        expect.objectContaining({ keepChallengeId: "out1" }),
      );
    });

    it("refreshes the roster only when something was withdrawn", async () => {
      mount(true);
      await flush();
      expect(refresh).not.toHaveBeenCalled();

      m.cancelStaleOutgoingChallenges.mockResolvedValue({
        ok: true,
        data: { cancelled: [{ challengeId: "old" }] },
      });
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("a capped insert withdraws stale ones and retries exactly once", async () => {
      const { result } = mount(true);
      await flush();
      m.cancelStaleOutgoingChallenges.mockResolvedValue({
        ok: true,
        data: { cancelled: [{ challengeId: "old" }] },
      });
      m.createChallenge
        .mockResolvedValueOnce(CAPPED)
        .mockResolvedValue({ ok: true, data: { id: "out1", expiresAt: null } });

      await act(() => result.current.sendChallenge("ana", "Ana"));

      expect(m.createChallenge).toHaveBeenCalledTimes(2);
      expect(result.current.outgoing).toEqual({
        challengeId: "out1",
        opponentId: "ana",
        opponentName: "Ana",
      });
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("says plainly when the cap still refuses", async () => {
      const { result } = mount(true);
      await flush();
      m.createChallenge.mockResolvedValue(CAPPED);

      await act(() => result.current.sendChallenge("ana", "Ana"));

      // Nothing stale to withdraw: no retry.
      expect(m.createChallenge).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(CHALLENGE_CAP_MESSAGE);
      expect(result.current.outgoing).toBeNull();
    });

    it("says who left the Arena when the opponent is not live (not the cap)", async () => {
      const { result } = mount(true);
      await flush();
      m.createChallenge.mockResolvedValue(CAPPED);
      rt.opponent = { data: { looking_for_ranked: false, status: "active" }, error: null };

      await act(() => result.current.sendChallenge("ana", "Ana"));

      expect(toast.info).toHaveBeenCalledWith(opponentLeftMessage("Ana"));
      expect(toast.error).not.toHaveBeenCalledWith(CHALLENGE_CAP_MESSAGE);
      expect(result.current.outgoing).toBeNull();
    });

    it("does not assert the cap when the opponent row cannot be read", async () => {
      const { result } = mount(true);
      await flush();
      m.createChallenge.mockResolvedValue(CAPPED);
      rt.opponent = { data: null, error: { message: "rls" } };

      await act(() => result.current.sendChallenge("ana", "Ana"));

      expect(toast.error).toHaveBeenCalledWith(CHALLENGE_SEND_FAILED_MESSAGE);
      expect(toast.error).not.toHaveBeenCalledWith(CHALLENGE_CAP_MESSAGE);
    });

    it("does not sweep for a failure that is not the cap", async () => {
      const { result } = mount(true);
      await flush();
      m.cancelStaleOutgoingChallenges.mockClear();
      m.createChallenge.mockResolvedValue({
        ok: false,
        error: { code: "UNKNOWN", message: "down" },
      });

      await act(() => result.current.sendChallenge("ana", "Ana"));

      expect(m.cancelStaleOutgoingChallenges).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("down");
    });
  });
});

describe("challenger recovery after a reload (the waiting bar is in-memory only)", () => {
  const flush = () => act(async () => {});
  const STALE_MS = 11 * 60_000;

  it("restores my newest fresh outgoing on mount and listens for its accept", async () => {
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: true,
      data: { incoming: [], outgoing: [pending("out9"), pending("older", { ageMs: 120_000 })] },
    });
    const { result } = mount(true);
    await flush();
    expect(result.current.outgoing).toEqual({
      challengeId: "out9",
      opponentId: "ana",
      opponentName: "Ana",
    });
    // The sweep reuses the same read and keeps the restored one.
    expect(m.cancelStaleOutgoingChallenges).toHaveBeenCalledWith(
      expect.anything(),
      "me",
      expect.objectContaining({ keepChallengeId: "out9", outgoing: expect.any(Array) }),
    );
    const [ch] = live("arena-challenge:out9");
    await act(async () => {
      fire(ch, "broadcast", "match_started", { payload: { matchId: "m3" } });
    });
    expect(push).toHaveBeenCalledWith("/arena/match/m3");
  });

  it("does not restore a stale outgoing challenge", async () => {
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: true,
      data: { incoming: [], outgoing: [pending("old", { ageMs: STALE_MS })] },
    });
    const { result } = mount(true);
    await flush();
    expect(result.current.outgoing).toBeNull();
  });

  it("does not restore behind a match on screen", async () => {
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: true,
      data: { incoming: [], outgoing: [pending("out9")] },
    });
    const { result } = mount(false, true);
    await flush();
    expect(result.current.outgoing).toBeNull();
  });

  it("never replaces the bar that is already up", async () => {
    const { result } = mount(true);
    await act(() => result.current.sendChallenge("bo", "Bo"));
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: true,
      data: { incoming: [], outgoing: [pending("other")] },
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.outgoing?.challengeId).toBe("out1");
  });

  it("does not bring back a challenge this tab just withdrew", async () => {
    const { result } = mount(true);
    await act(() => result.current.sendChallenge("ana", "Ana"));
    await act(() => result.current.cancelOutgoing());
    // A read that raced the cancel still lists it as pending.
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: true,
      data: { incoming: [], outgoing: [pending("out1")] },
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.outgoing).toBeNull();
  });

  it("falls back to the plain sweep when the read fails", async () => {
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "x" },
    });
    const { result } = mount(true);
    await flush();
    expect(result.current.outgoing).toBeNull();
    expect(m.cancelStaleOutgoingChallenges).toHaveBeenCalledWith(expect.anything(), "me", {
      keepChallengeId: null,
    });
  });

  describe("a 'started' UPDATE for a challenge not on the bar", () => {
    async function started(row: Record<string, unknown>, hook = mount(true)) {
      await flush();
      await act(async () => {
        await fire(incomingChannel(), "postgres_changes", "UPDATE", { new: row }, "challenger");
      });
      return hook;
    }
    const fresh = () => new Date(Date.now() - 30_000).toISOString();

    it("joins a fresh one of mine", async () => {
      await started({
        id: "lost",
        status: "started",
        challenger_id: "me",
        opponent_id: "ana",
        created_at: fresh(),
      });
      expect(m.startMatchFromChallenge).toHaveBeenCalledWith(expect.anything(), "lost");
      expect(push).toHaveBeenCalledWith("/arena/match/m1");
      await flush();
      expect(m.declineOtherPendingChallenges).toHaveBeenCalledWith(expect.anything(), "me", {
        keepChallengeId: "lost",
        exceptChallengerId: "ana",
      });
    });

    it("ignores a stale one", async () => {
      await started({
        id: "lost",
        status: "started",
        challenger_id: "me",
        created_at: new Date(Date.now() - STALE_MS).toISOString(),
      });
      expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
    });

    it("ignores one without a timestamp", async () => {
      await started({ id: "lost", status: "started", challenger_id: "me" });
      expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
    });

    it("ignores it while a match is on screen", async () => {
      await started(
        { id: "lost", status: "started", challenger_id: "me", created_at: fresh() },
        mount(false, true),
      );
      expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
    });

    it("still ignores other statuses", async () => {
      await started({ id: "lost", status: "declined", challenger_id: "me", created_at: fresh() });
      expect(toast.info).not.toHaveBeenCalled();
      expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
    });
  });
});

describe("entering a match settles my other incoming challenges (mobile parity)", () => {
  const flush = () => act(async () => {});

  it("declines the other fresh ones, tells each challenger, and quietly withdraws the peer's", async () => {
    m.declineOtherPendingChallenges.mockResolvedValue({
      ok: true,
      data: {
        declined: [
          pending("x1", { challengerId: "bo", opponentId: "me" }),
          pending("x2", { challengerId: "cy", opponentId: "me" }),
        ],
        skipped: [pending("x3", { challengerId: "ana", opponentId: "me" })],
      },
    });
    const { result } = mount(true);
    await insertChallenge("c1");
    await act(() => result.current.accept());
    await flush();
    expect(m.declineOtherPendingChallenges).toHaveBeenCalledWith(expect.anything(), "me", {
      keepChallengeId: "c1",
      exceptChallengerId: "ana",
    });
    const sentOn = (topic: string) =>
      rt.channels.filter((c) => c.topic === topic).flatMap((c) => c.sent);
    expect(sentOn("arena-challenge:x1")).toEqual([{ event: "declined", payload: {} }]);
    expect(sentOn("arena-challenge:x2")).toEqual([{ event: "declined", payload: {} }]);
    expect(sentOn("arena-challenge:x3")).toEqual([]);
    expect(m.cancelChallenge).toHaveBeenCalledWith(expect.anything(), "x3", {
      onlyIfPending: true,
    });
  });

  it("uses the opponent as the peer when my own challenge was accepted", async () => {
    const { result } = mount(true);
    await act(() => result.current.sendChallenge("ana", "Ana"));
    const [ch] = live("arena-challenge:out1");
    await act(async () => {
      fire(ch, "broadcast", "match_started", { payload: { matchId: "m9" } });
    });
    await flush();
    expect(m.declineOtherPendingChallenges).toHaveBeenCalledWith(expect.anything(), "me", {
      keepChallengeId: "out1",
      exceptChallengerId: "ana",
    });
  });

  it("a failed read broadcasts nothing", async () => {
    m.declineOtherPendingChallenges.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "x" },
    });
    const { result } = mount(true);
    await insertChallenge("c1");
    await act(() => result.current.accept());
    await flush();
    const sent = rt.channels
      .filter((c) => c.topic !== "arena-challenge:c1")
      .flatMap((c) => c.sent);
    expect(sent).toEqual([]);
    expect(push).toHaveBeenCalledWith("/arena/match/m1");
  });
});
