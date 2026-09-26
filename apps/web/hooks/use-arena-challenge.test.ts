import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  ACCEPTED_FALLBACK_MS,
  ACCEPT_FAILED_MESSAGE,
  ARENA_MATCH_STARTED_MESSAGE,
  CHALLENGE_CAP_MESSAGE,
  CHALLENGE_GONE_MESSAGE,
  CHALLENGE_SEND_FAILED_MESSAGE,
  START_RETRY_MS,
  couldNotStartMessage,
  opponentLeftMessage,
  useArenaChallenge,
} from "./use-arena-challenge";

type Handler = (payload: unknown) => unknown;
interface FakeChannel {
  topic: string;
  handlers: { type: string; filter: Record<string, string>; fn: Handler }[];
  sent: { event: string; payload: unknown }[];
  statusCb: ((status: string) => void) | null;
  subscribed: boolean;
  on: (type: string, filter: Record<string, string>, fn: Handler) => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
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
  /**
   * When true, a broadcast is delivered, on a later microtask, to every OTHER
   * live channel on the same topic (the fake server shared by two clients).
   */
  deliver: false,
  /**
   * realtime-js 2.105.4 semantics: `channel(topic)` hands back a registered
   * instance with that topic, including one still LEAVING after
   * `removeChannel` (the leave lands a macrotask later); `subscribe()` on a
   * leaving instance does nothing; `on("postgres_changes")` on a joined one
   * throws. A leaving instance is dead once its leave lands.
   */
  realistic: false,
  leaving: [] as FakeChannel[],
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: (topic: string) => {
      // Two fake clients share this one registry, so per-challenge topics
      // (cross-client by design) are not reused in two-client mode; the
      // incoming topic is per athlete, so it stands in for one client's.
      if (rt.realistic && (!rt.deliver || topic.startsWith("arena-incoming:"))) {
        const existing = rt.channels.find((c) => c.topic === topic && !rt.removed.includes(c));
        if (existing) return existing;
      }
      const ch: FakeChannel = {
        topic,
        handlers: [],
        sent: [],
        statusCb: null,
        subscribed: false,
        on(type, filter, fn) {
          if (
            rt.realistic &&
            ch.subscribed &&
            !rt.leaving.includes(ch) &&
            type === "postgres_changes"
          ) {
            throw new Error(`cannot add \`${type}\` callbacks for ${topic} after \`subscribe()\`.`);
          }
          ch.handlers.push({ type, filter, fn });
          return ch;
        },
        subscribe: (cb) => {
          if (rt.realistic && rt.leaving.includes(ch)) return ch;
          ch.subscribed = true;
          ch.statusCb = cb ?? null;
          return ch;
        },
        send: async (m) => {
          ch.sent.push({ event: m.event, payload: m.payload });
          if (rt.deliver) {
            // Delivered later, as a real socket would, never inside send().
            const targets = rt.channels.filter(
              (o) => o !== ch && o.topic === ch.topic && !rt.removed.includes(o),
            );
            queueMicrotask(() => {
              for (const other of targets) {
                if (rt.removed.includes(other)) continue;
                for (const h of other.handlers) {
                  if (h.type === "broadcast" && h.filter.event === m.event) {
                    void h.fn({ payload: m.payload });
                  }
                }
              }
            });
          }
          return "ok";
        },
      };
      rt.channels.push(ch);
      return ch;
    },
    removeChannel: async (ch: FakeChannel) => {
      if (!rt.realistic) {
        rt.removed.push(ch);
        return;
      }
      rt.leaving.push(ch);
      await new Promise((r) => setTimeout(r, 0));
      rt.leaving.splice(rt.leaving.indexOf(ch), 1);
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

// One stable router, as Next's `useRouter()` returns: a fresh object per
// render would re-run every effect keyed on it and hide remount bugs.
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const { push, refresh } = router;
vi.mock("next/navigation", () => ({ useRouter: () => router }));
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
const q = vi.hoisted(() => ({
  getPendingChallengesForAthlete: vi.fn(),
  getChallengeStatus: vi.fn(),
}));
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
  rt.channels.filter(
    (c) => c.topic === topic && !rt.removed.includes(c) && !rt.leaving.includes(c),
  );
/** The live incoming postgres_changes channel (its topic carries a per-build suffix). */
const incomingOf = (athleteId: string) =>
  rt.channels.filter(
    (c) =>
      c.topic.startsWith(`arena-incoming:${athleteId}:`) &&
      !rt.removed.includes(c) &&
      !rt.leaving.includes(c),
  )[0];
const incomingChannel = () => incomingOf("me");
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
  rt.deliver = false;
  rt.realistic = false;
  rt.leaving = [];
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
  q.getChallengeStatus.mockResolvedValue({
    ok: true,
    data: { status: "pending", expiresAt: null },
  });
});

type MountProps = { canReceive: boolean; inMatch?: boolean; lobbyIds?: Set<string> };
function mount(canReceive = true, inMatch = false, lobbyIds?: Set<string>) {
  return renderHook(
    ({ canReceive, inMatch, lobbyIds }: MountProps) =>
      useArenaChallenge({ athleteId: "me", athleteWeight: 170, canReceive, inMatch, lobbyIds }),
    { initialProps: { canReceive, inMatch, lobbyIds } as MountProps },
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
      q.getChallengeStatus.mockResolvedValue({
        ok: true,
        data: { status: "declined", expiresAt: null },
      });
      const { result } = mount(true);
      await act(() => result.current.sendChallenge("bo", "Bo"));
      await insertChallenge("c1");
      await act(() => result.current.accept());
      expect(push).toHaveBeenCalledWith("/arena/match/m1");
      expect(m.cancelChallenge).toHaveBeenCalledWith(expect.anything(), "out1", {
        onlyIfPending: true,
      });
      // Declined meanwhile: dropped quietly, not toasted.
      expect(toast.info).not.toHaveBeenCalled();
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

    it("maps not_accepted to 'no longer available' after one retry (a lost row lock, jits-njyd)", async () => {
      m.startMatchFromChallenge.mockResolvedValue({
        ok: false,
        error: { code: "CHALLENGE_NOT_ACCEPTED", message: "raw" },
      });
      const { result } = mount(true);
      await insertChallenge();
      await act(() => result.current.accept());
      expect(m.startMatchFromChallenge).toHaveBeenCalledTimes(2);
      // A dead challenge is not withdrawn (there is nothing accepted to free).
      expect(m.cancelChallenge).not.toHaveBeenCalled();
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

  it("accepting an incoming challenge withdraws my own pending one FIRST", async () => {
    const { result } = mount(true);
    await act(() => result.current.sendChallenge("bo", "Bo"));
    await insertChallenge("c1");
    await act(() => result.current.accept());
    expect(push).toHaveBeenCalledWith("/arena/match/m1");
    expect(m.cancelChallenge).toHaveBeenCalledWith(expect.anything(), "out1", {
      onlyIfPending: true,
    });
    expect(m.cancelChallenge.mock.invocationCallOrder[0]).toBeLessThan(
      m.acceptChallenge.mock.invocationCallOrder[0],
    );
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

// ---------------------------------------------------------------------------
// Mobile concurrency parity (jits-7dqt)
// ---------------------------------------------------------------------------

const flushAll = () => act(async () => {});
const sentOn = (topic: string) =>
  rt.channels.filter((c) => c.topic === topic).flatMap((c) => c.sent);

async function insertFor(
  athleteId: string,
  id: string,
  challengerId: string,
): Promise<void> {
  await act(async () => {
    await fire(incomingOf(athleteId), "postgres_changes", "INSERT", {
      new: { id, challenger_id: challengerId, opponent_id: athleteId, status: "pending" },
    });
  });
}

async function sendAs(
  result: { current: ReturnType<typeof useArenaChallenge> },
  id: string,
  opponentId: string,
): Promise<void> {
  m.createChallenge.mockResolvedValueOnce({ ok: true, data: { id } });
  await act(() => result.current.sendChallenge(opponentId, opponentId));
  expect(result.current.outgoing?.challengeId).toBe(id);
}

describe("accepting while my own challenge is out", () => {
  it("joins MY match instead when it had already started", async () => {
    m.cancelChallenge.mockResolvedValueOnce({ ok: true, data: { cancelled: false } });
    q.getChallengeStatus.mockResolvedValue({ ok: true, data: { status: "started", expiresAt: null } });
    m.startMatchFromChallenge.mockResolvedValue({ ok: true, data: { match_id: "m-mine" } });
    const { result } = mount(true);
    await sendAs(result, "out1", "bo");
    await insertChallenge("c1");

    await act(() => result.current.accept());

    expect(m.acceptChallenge).not.toHaveBeenCalled();
    expect(m.startMatchFromChallenge).toHaveBeenCalledWith(expect.anything(), "out1");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/arena/match/m-mine");
    await flushAll();
    // Entering declines everyone else waiting on me, c1 included.
    expect(m.declineOtherPendingChallenges).toHaveBeenCalledWith(expect.anything(), "me", {
      keepChallengeId: "out1",
      exceptChallengerId: "bo",
    });
  });

  it("keeps waiting when mine was just accepted, and declines the incoming", async () => {
    m.cancelChallenge.mockResolvedValueOnce({ ok: true, data: { cancelled: false } });
    q.getChallengeStatus.mockResolvedValue({ ok: true, data: { status: "accepted", expiresAt: null } });
    const { result } = mount(true);
    await sendAs(result, "out1", "bo");
    await insertChallenge("c1");

    await act(() => result.current.accept());

    expect(m.acceptChallenge).not.toHaveBeenCalled();
    expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
    expect(m.declineChallenge).toHaveBeenCalledWith(expect.anything(), "c1");
    expect(sentOn("arena-challenge:c1")).toEqual([{ event: "declined", payload: {} }]);
    expect(result.current.incoming).toBeNull();
    expect(result.current.outgoing?.challengeId).toBe("out1");
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the prompt when mine could not be withdrawn (network)", async () => {
    m.cancelChallenge.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const { result } = mount(true);
    await sendAs(result, "out1", "bo");
    await insertChallenge("c1");

    await act(() => result.current.accept());

    expect(toast.error).toHaveBeenCalledWith(ACCEPT_FAILED_MESSAGE);
    expect(m.acceptChallenge).not.toHaveBeenCalled();
    expect(result.current.incoming?.challengeId).toBe("c1");
    expect(result.current.outgoing?.challengeId).toBe("out1");
  });
});

describe("crossing challenges (A and B challenge each other)", () => {
  // The lower id is canonical on both clients.
  const LOW = "ch-a";
  const HIGH = "ch-b";

  it("accepts the canonical one straight away, then withdraws my own", async () => {
    const { result } = mount(true);
    await sendAs(result, HIGH, "ana");
    await insertChallenge(LOW);

    await act(() => result.current.accept());

    expect(m.acceptChallenge).toHaveBeenCalledWith(expect.anything(), {
      challengeId: LOW,
      opponentWeight: 170,
    });
    expect(push).toHaveBeenCalledTimes(1);
    await flushAll();
    // My own is withdrawn after entry, pending-guarded, never before the accept.
    expect(m.cancelChallenge).toHaveBeenCalledWith(expect.anything(), HIGH, {
      onlyIfPending: true,
    });
    expect(m.cancelChallenge.mock.invocationCallOrder[0]).toBeGreaterThan(
      m.acceptChallenge.mock.invocationCallOrder[0],
    );
    expect(m.declineOtherPendingChallenges).toHaveBeenCalledWith(expect.anything(), "me", {
      keepChallengeId: LOW,
      exceptChallengerId: "ana",
    });
  });

  it("says nothing when the other side won the canonical row, and joins via its broadcast", async () => {
    m.startMatchFromChallenge.mockResolvedValue({
      ok: false,
      error: { code: "CHALLENGE_NOT_ACCEPTED", message: "no" },
    });
    const { result } = mount(true);
    await sendAs(result, HIGH, "ana");
    await insertChallenge(LOW);

    await act(() => result.current.accept());

    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.incoming).toBeNull();
    expect(result.current.outgoing?.challengeId).toBe(HIGH);
    await act(async () => {
      fire(live(`arena-challenge:${HIGH}`)[0], "broadcast", "match_started", {
        payload: { matchId: "m-high" },
      });
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/arena/match/m-high");
  });

  it("withdraws the canonical one first when my incoming is the other", async () => {
    const { result } = mount(true);
    await sendAs(result, LOW, "ana");
    await insertChallenge(HIGH);

    await act(() => result.current.accept());

    expect(m.cancelChallenge.mock.calls[0]).toEqual([
      expect.anything(),
      LOW,
      { onlyIfPending: true },
    ]);
    expect(m.acceptChallenge).toHaveBeenCalledWith(expect.anything(), {
      challengeId: HIGH,
      opponentWeight: 170,
    });
  });

  it("withdraws (never declines) the other half when the canonical one was already accepted", async () => {
    m.cancelChallenge.mockImplementation(async (_c: unknown, id: string) => ({
      ok: true,
      data: { cancelled: id !== LOW },
    }));
    q.getChallengeStatus.mockResolvedValue({ ok: true, data: { status: "accepted", expiresAt: null } });
    const { result } = mount(true);
    await sendAs(result, LOW, "ana");
    await insertChallenge(HIGH);

    await act(() => result.current.accept());

    expect(m.declineChallenge).not.toHaveBeenCalled();
    expect(m.cancelChallenge).toHaveBeenCalledWith(expect.anything(), HIGH, {
      onlyIfPending: true,
    });
    expect(result.current.outgoing?.challengeId).toBe(LOW);
    expect(push).not.toHaveBeenCalled();
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
    m.cancelChallenge.mockImplementation(
      async (_c: unknown, id: string, opts?: { onlyIfPending?: boolean }) => {
        const ok = opts?.onlyIfPending
          ? rows[id].status === "pending"
          : ["pending", "accepted"].includes(rows[id].status);
        if (ok) rows[id].status = "cancelled";
        return { ok: true, data: { cancelled: ok } };
      },
    );
    m.acceptChallenge.mockImplementation(async (_c: unknown, p: { challengeId: string }) => {
      if (rows[p.challengeId].status === "pending") rows[p.challengeId].status = "accepted";
      return { ok: true, data: null };
    });
    m.startMatchFromChallenge.mockImplementation(async (_c: unknown, id: string) => {
      if (matches[id]) return { ok: true, data: { match_id: matches[id] } };
      if (rows[id].status !== "accepted") {
        return { ok: false, error: { code: "CHALLENGE_NOT_ACCEPTED", message: "no" } };
      }
      matches[id] = `m-${id}`;
      rows[id].status = "started";
      return { ok: true, data: { match_id: matches[id] } };
    });
    q.getChallengeStatus.mockImplementation(async (_c: unknown, id: string) => ({
      ok: true,
      data: { status: rows[id].status, expiresAt: null },
    }));
    rt.deliver = true;
    return { rows, matches };
  }

  /** Lets pending leaves (a macrotask in realistic mode) and deliveries land. */
  const settle = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

  async function mountPair(strict: boolean) {
    const X = "me";
    const Y = "ana";
    const opts = { reactStrictMode: strict };
    const x = renderHook(() => useArenaChallenge({ athleteId: X, athleteWeight: 170 }), opts);
    const y = renderHook(() => useArenaChallenge({ athleteId: Y, athleteWeight: 170 }), opts);
    await settle();
    // X sent the canonical (lower id) one, Y the other; each has the other's prompt.
    await sendAs(x.result, LOW, Y);
    await sendAs(y.result, HIGH, X);
    await insertFor(X, HIGH, Y);
    await insertFor(Y, LOW, X);
    expect(x.result.current.incoming?.challengeId).toBe(HIGH);
    expect(y.result.current.incoming?.challengeId).toBe(LOW);
    return { x, y };
  }

  const ORDERS = [
    ["X taps first", "x-first"],
    ["Y taps first", "y-first"],
    ["both at once, X's write first", "both-x"],
    ["both at once, Y's write first", "both-y"],
  ] as const;
  it.each([
    ...ORDERS.map(([label, order]) => [label, order, false] as const),
    // Strict Mode double-mounts every effect, against realtime-js's reuse of
    // a still-leaving channel instance (see `rt.realistic`).
    ...ORDERS.map(([label, order]) => [`${label}, Strict Mode`, order, true] as const),
  ])("both land in ONE match: %s", async (_label, order, strict) => {
    const server = fakeServer("me", "ana");
    rt.realistic = strict;
    const { x, y } = await mountPair(strict);

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
    await settle();

    expect(push).toHaveBeenCalledTimes(2);
    const hrefs = push.mock.calls.map((c) => c[0]);
    expect(new Set(hrefs).size).toBe(1);
    expect(Object.keys(server.matches)).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();
    x.unmount();
    y.unmount();
  });
});

describe("the challenger's safety net for a row stuck at 'accepted'", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  async function waitingOnAccepted() {
    const hook = mount(true);
    await sendAs(hook.result, "out1", "ana");
    await challengerUpdate("out1", "accepted");
    return hook;
  }

  it("starts the match itself when the row is still 'accepted' 12s later", async () => {
    const { result } = await waitingOnAccepted();
    q.getChallengeStatus.mockResolvedValue({ ok: true, data: { status: "accepted", expiresAt: null } });
    await advance(ACCEPTED_FALLBACK_MS - 1);
    expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
    await advance(1);
    expect(m.startMatchFromChallenge).toHaveBeenCalledWith(expect.anything(), "out1");
    expect(push).toHaveBeenCalledWith("/arena/match/m1");
    expect(result.current.outgoing).toBeNull();
  });

  it("does nothing extra when the accepter's broadcast arrived in time", async () => {
    await waitingOnAccepted();
    await act(async () => {
      fire(live("arena-challenge:out1")[0], "broadcast", "match_started", {
        payload: { matchId: "m5" },
      });
    });
    await advance(ACCEPTED_FALLBACK_MS);
    expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("says the match could not start when the accepter withdrew it", async () => {
    const { result } = await waitingOnAccepted();
    await challengerUpdate("out1", "cancelled");
    expect(result.current.outgoing).toBeNull();
    expect(toast.info).toHaveBeenCalledWith(couldNotStartMessage("ana"));
    await advance(ACCEPTED_FALLBACK_MS);
    expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
  });

  it("stays quiet for my own cancel of a challenge seen accepted", async () => {
    const { result } = await waitingOnAccepted();
    await act(() => result.current.cancelOutgoing());
    await challengerUpdate("out1", "cancelled");
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("a failed fallback start re-reads once and joins a row that turned 'started'", async () => {
    await waitingOnAccepted();
    q.getChallengeStatus.mockResolvedValue({ ok: true, data: { status: "accepted", expiresAt: null } });
    m.startMatchFromChallenge.mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN", message: "lock" },
    });
    await advance(ACCEPTED_FALLBACK_MS);
    expect(push).not.toHaveBeenCalled();
    q.getChallengeStatus.mockResolvedValue({ ok: true, data: { status: "started", expiresAt: null } });
    await advance(START_RETRY_MS);
    expect(m.startMatchFromChallenge).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith("/arena/match/m1");
  });

  it("is cancelled on unmount", async () => {
    const { unmount } = await waitingOnAccepted();
    unmount();
    await advance(ACCEPTED_FALLBACK_MS);
    expect(q.getChallengeStatus).not.toHaveBeenCalled();
  });
});

describe("an INSERT while I am busy is declined, not ignored", () => {
  it("declines and tells the challenger when I am in a match", async () => {
    mount(false, true);
    await flushAll();
    await insertChallenge("c9");
    expect(m.declineChallenge).toHaveBeenCalledWith(expect.anything(), "c9");
    await flushAll();
    expect(sentOn("arena-challenge:c9")).toEqual([{ event: "declined", payload: {} }]);
  });

  it("declines one that lands between accept and the match screen", async () => {
    const { result } = mount(true);
    await insertChallenge("c1");
    await act(() => result.current.accept());
    await act(async () => {
      await fire(incomingChannel(), "postgres_changes", "INSERT", {
        new: { id: "c2", challenger_id: "bo", status: "pending" },
      });
    });
    expect(m.declineChallenge).toHaveBeenCalledWith(expect.anything(), "c2");
    expect(result.current.incoming).toBeNull();
  });

  it("withdraws the peer's late challenge quietly, never declines it", async () => {
    const { result } = mount(true);
    await insertChallenge("c1");
    await act(() => result.current.accept());
    // "ana" is the athlete I am entering a match with.
    await insertChallenge("c2");
    expect(m.declineChallenge).not.toHaveBeenCalled();
    expect(m.cancelChallenge).toHaveBeenCalledWith(expect.anything(), "c2", {
      onlyIfPending: true,
    });
  });

  it("forgets the peer once I leave the match", async () => {
    const { result, rerender } = mount(true);
    await insertChallenge("c1");
    await act(() => result.current.accept());
    rerender({ canReceive: false, inMatch: true });
    rerender({ canReceive: true, inMatch: false });
    await flushAll();
    await insertChallenge("c2");
    expect(m.cancelChallenge).not.toHaveBeenCalledWith(expect.anything(), "c2", expect.anything());
    expect(result.current.incoming?.challengeId).toBe("c2");
  });

  it("still only ignores (never declines) one that lands while another prompt is up", async () => {
    const { result } = mount(true);
    await insertChallenge("c1");
    await insertChallenge("c2");
    expect(result.current.incoming?.challengeId).toBe("c1");
    expect(m.declineChallenge).not.toHaveBeenCalled();
  });
});

describe("pending challenges are read again when a prompt clears (mobile parity)", () => {
  const incomingPending = (id: string, challengerId: string) =>
    pending(id, { challengerId, opponentId: "me" });

  it("offers the next queued challenger when I decline", async () => {
    const lobby = new Set(["ana", "bo"]);
    const { result } = mount(true, false, lobby);
    await flushAll();
    await insertChallenge("c1");
    q.getPendingChallengesForAthlete.mockClear();
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: true,
      data: { incoming: [incomingPending("c1", "ana"), incomingPending("c2", "bo")], outgoing: [] },
    });
    rt.lookup = () => Promise.resolve({ data: { display_name: "Bo" } });

    await act(() => result.current.decline());
    await flushAll();

    expect(q.getPendingChallengesForAthlete).toHaveBeenCalledTimes(1);
    // The one I just declined is never raised again; the next one is.
    expect(result.current.incoming).toEqual({
      challengeId: "c2",
      challengerId: "bo",
      challengerName: "Bo",
    });
  });

  it("re-reads when the challenger withdraws the prompt", async () => {
    mount(true);
    await flushAll();
    await insertChallenge("c1");
    q.getPendingChallengesForAthlete.mockClear();
    await act(async () => {
      fire(incomingChannel(), "postgres_changes", "UPDATE", { new: { id: "c1", status: "cancelled" } });
    });
    expect(q.getPendingChallengesForAthlete).toHaveBeenCalledTimes(1);
  });

  it("re-reads on the challenger's cancelled broadcast", async () => {
    mount(true);
    await flushAll();
    await insertChallenge("c1");
    q.getPendingChallengesForAthlete.mockClear();
    await act(async () => {
      fire(live("arena-challenge:c1")[0], "broadcast", "cancelled", {});
    });
    expect(q.getPendingChallengesForAthlete).toHaveBeenCalledTimes(1);
  });

  it("re-reads when an accept finds the challenge dead", async () => {
    m.startMatchFromChallenge.mockResolvedValue({
      ok: false,
      error: { code: "CHALLENGE_NOT_ACCEPTED", message: "x" },
    });
    const { result } = mount(true);
    await flushAll();
    await insertChallenge("c1");
    q.getPendingChallengesForAthlete.mockClear();
    await act(() => result.current.accept());
    expect(toast.error).toHaveBeenCalledWith(CHALLENGE_GONE_MESSAGE);
    expect(q.getPendingChallengesForAthlete).toHaveBeenCalledTimes(1);
  });

  it("does not re-read for my own accept landing on the prompt's UPDATE", async () => {
    mount(true);
    await flushAll();
    await insertChallenge("c1");
    q.getPendingChallengesForAthlete.mockClear();
    await act(async () => {
      fire(incomingChannel(), "postgres_changes", "UPDATE", { new: { id: "c1", status: "accepted" } });
    });
    expect(q.getPendingChallengesForAthlete).not.toHaveBeenCalled();
  });

  it("offers a fresh pending challenge at mount only once its challenger is in the lobby", async () => {
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: true,
      data: { incoming: [incomingPending("c7", "ana")], outgoing: [] },
    });
    const { result, rerender } = mount(true, false, new Set());
    await flushAll();
    expect(result.current.incoming).toBeNull();
    rerender({ canReceive: true, lobbyIds: new Set(["ana"]) });
    await flushAll();
    expect(result.current.incoming?.challengeId).toBe("c7");
  });

  it("never offers while offline, nor a stale one", async () => {
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: true,
      data: {
        incoming: [pending("old", { challengerId: "ana", opponentId: "me", ageMs: 11 * 60_000 })],
        outgoing: [],
      },
    });
    const lobby = new Set(["ana"]);
    const offline = mount(false, false, lobby);
    await flushAll();
    expect(offline.result.current.incoming).toBeNull();
    const liveHook = mount(true, false, lobby);
    await flushAll();
    expect(liveHook.result.current.incoming).toBeNull();
  });
});

describe("accept succeeded but the start did not", () => {
  it("retries the start once, then withdraws the accepted row", async () => {
    m.startMatchFromChallenge.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "down" } });
    const { result } = mount(true);
    await insertChallenge("c1");
    await act(() => result.current.accept());
    expect(m.startMatchFromChallenge).toHaveBeenCalledTimes(2);
    expect(m.cancelChallenge).toHaveBeenCalledWith(expect.anything(), "c1");
    expect(toast.error).toHaveBeenCalledWith("down");
  });

  it("recovers when the start had landed and only its reply was lost", async () => {
    m.startMatchFromChallenge
      .mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "lost" } })
      .mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "lost" } })
      .mockResolvedValue({ ok: true, data: { match_id: "m4" } });
    m.cancelChallenge.mockResolvedValue({ ok: true, data: { cancelled: false } });
    const { result } = mount(true);
    await insertChallenge("c1");
    await act(() => result.current.accept());
    expect(push).toHaveBeenCalledWith("/arena/match/m4");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("joins on the 'started' UPDATE the challenger's fallback produced", async () => {
    m.startMatchFromChallenge.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "down" } });
    m.cancelChallenge.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "down" } });
    const { result } = mount(true);
    await insertChallenge("c1");
    await act(() => result.current.accept());
    expect(push).not.toHaveBeenCalled();

    m.startMatchFromChallenge.mockResolvedValue({ ok: true, data: { match_id: "m8" } });
    await act(async () => {
      await fire(incomingChannel(), "postgres_changes", "UPDATE", {
        new: { id: "c1", challenger_id: "ana", status: "started" },
      });
    });
    expect(push).toHaveBeenCalledWith("/arena/match/m8");
  });

  it("ignores a 'started' UPDATE for a challenge I never accepted", async () => {
    mount(true);
    await act(async () => {
      await fire(incomingChannel(), "postgres_changes", "UPDATE", {
        new: { id: "zz", challenger_id: "ana", status: "started" },
      });
    });
    expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
  });
});

describe("one client never pushes two match screens", () => {
  it("refuses a second entry for a DIFFERENT challenge before the first screen mounts", async () => {
    const { result } = mount(true);
    await insertChallenge("c1");
    await act(() => result.current.accept());
    // A started UPDATE for an unrelated challenge of mine lands right after.
    await act(async () => {
      await fire(
        incomingChannel(),
        "postgres_changes",
        "UPDATE",
        {
          new: {
            id: "other",
            status: "started",
            challenger_id: "me",
            opponent_id: "bo",
            created_at: new Date().toISOString(),
          },
        },
        "challenger",
      );
    });
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe("the outgoing channel re-reads its row once it is subscribed", () => {
  it("joins a match that started before the listener was up", async () => {
    const { result } = mount(true);
    await sendAs(result, "out1", "ana");
    q.getChallengeStatus.mockResolvedValue({ ok: true, data: { status: "started", expiresAt: null } });
    await act(async () => {
      live("arena-challenge:out1")[0].statusCb?.("SUBSCRIBED");
    });
    expect(push).toHaveBeenCalledWith("/arena/match/m1");
  });
});

describe("the incoming channel survives a remount that overlaps its own teardown", () => {
  it("still hears INSERTs under Strict Mode with realtime-js channel reuse", async () => {
    rt.realistic = true;
    const { result } = renderHook(
      () => useArenaChallenge({ athleteId: "me", athleteWeight: 170, canReceive: true }),
      { reactStrictMode: true },
    );
    // Let the first mount's leave land.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    const ch = incomingChannel();
    expect(ch).toBeDefined();
    expect(ch.subscribed).toBe(true);
    await act(async () => {
      await fire(ch, "postgres_changes", "INSERT", {
        new: { id: "c1", challenger_id: "ana", status: "pending" },
      });
    });
    expect(result.current.incoming?.challengeId).toBe("c1");
  });
});

describe("a pending challenge found by a read is re-checked before its prompt is raised", () => {
  it("does not raise one the challenger withdrew while the tab was hidden", async () => {
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: true,
      data: { incoming: [pending("c7", { challengerId: "ana", opponentId: "me" })], outgoing: [] },
    });
    q.getChallengeStatus.mockResolvedValue({ ok: true, data: { status: "cancelled", expiresAt: null } });
    const { result } = mount(true, false, new Set(["ana"]));
    await flushAll();
    await flushAll();
    expect(q.getChallengeStatus).toHaveBeenCalledWith(expect.anything(), "c7");
    expect(result.current.incoming).toBeNull();
  });

  it("offers it again later when the status read failed", async () => {
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: true,
      data: { incoming: [pending("c7", { challengerId: "ana", opponentId: "me" })], outgoing: [] },
    });
    q.getChallengeStatus.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const { result, rerender } = mount(true, false, new Set(["ana"]));
    await flushAll();
    expect(result.current.incoming).toBeNull();
    // The next presence sync retries it; the row is still pending.
    rerender({ canReceive: true, lobbyIds: new Set(["ana"]) });
    await flushAll();
    expect(result.current.incoming?.challengeId).toBe("c7");
  });
});

describe("a session lobby or join wizard never races an Arena push (jits-zasq)", () => {
  type Props = { inSessionFlow: boolean };
  function mountFlow(inSessionFlow = false) {
    return renderHook(
      ({ inSessionFlow }: Props) =>
        useArenaChallenge({
          athleteId: "me",
          athleteWeight: 170,
          canReceive: !inSessionFlow,
          inSessionFlow,
        }),
      { initialProps: { inSessionFlow } as Props },
    );
  }
  /** The Join toast's options, from the last `toast.info` for it. */
  function joinToast() {
    const call = toast.info.mock.calls.find((c) => c[0] === ARENA_MATCH_STARTED_MESSAGE);
    return call?.[1] as
      | { id: string; duration: number; action: { label: string; onClick: () => void } }
      | undefined;
  }

  it("withdraws my pending challenge on entering, and tells its recipient", async () => {
    const hook = mountFlow(false);
    await sendAs(hook.result, "out1", "ana");
    hook.rerender({ inSessionFlow: true });
    await flushAll();
    expect(m.cancelChallenge).toHaveBeenCalledWith(expect.anything(), "out1", {
      onlyIfPending: true,
    });
    expect(sentOn("arena-challenge:out1")).toEqual([{ event: "cancelled", payload: {} }]);
    expect(hook.result.current.outgoing).toBeNull();
    expect(toast.info).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("does nothing on entering without a challenge out", async () => {
    const hook = mountFlow(false);
    await flushAll();
    hook.rerender({ inSessionFlow: true });
    await flushAll();
    expect(m.cancelChallenge).not.toHaveBeenCalled();
  });

  it("offers a Join toast, not a push, when mine had already started", async () => {
    const hook = mountFlow(false);
    await sendAs(hook.result, "out1", "ana");
    m.cancelChallenge.mockResolvedValueOnce({ ok: true, data: { cancelled: false } });
    q.getChallengeStatus.mockResolvedValue({ ok: true, data: { status: "started", expiresAt: null } });
    m.startMatchFromChallenge.mockResolvedValue({ ok: true, data: { match_id: "m6" } });
    hook.rerender({ inSessionFlow: true });
    await flushAll();
    await flushAll();

    expect(push).not.toHaveBeenCalled();
    expect(hook.result.current.outgoing).toBeNull();
    const options = joinToast();
    expect(options?.id).toBe("arena-join:out1");
    expect(options?.action.label).toBe("Join");

    act(() => options?.action.onClick());
    expect(push).toHaveBeenCalledWith("/arena/match/m6");
  });

  it("keeps waiting when mine was just accepted, and the accepter's broadcast becomes a Join toast", async () => {
    const hook = mountFlow(false);
    await sendAs(hook.result, "out1", "ana");
    m.cancelChallenge.mockResolvedValueOnce({ ok: true, data: { cancelled: false } });
    q.getChallengeStatus.mockResolvedValue({ ok: true, data: { status: "accepted", expiresAt: null } });
    hook.rerender({ inSessionFlow: true });
    await flushAll();
    expect(hook.result.current.outgoing?.challengeId).toBe("out1");

    await act(async () => {
      fire(live("arena-challenge:out1")[0], "broadcast", "match_started", {
        payload: { matchId: "m2" },
      });
    });
    // The broadcast and the `started` UPDATE both landing: one toast.
    await challengerUpdate("out1", "started");
    expect(push).not.toHaveBeenCalled();
    expect(toast.info.mock.calls.filter((c) => c[0] === ARENA_MATCH_STARTED_MESSAGE)).toHaveLength(1);
    act(() => joinToast()?.action.onClick());
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/arena/match/m2");
  });

  it("does not restore my outgoing bar while in the session flow", async () => {
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: true,
      data: { incoming: [], outgoing: [pending("out9")] },
    });
    const { result } = mountFlow(true);
    await flushAll();
    expect(result.current.outgoing).toBeNull();
  });

  it("offers a reload-lost started challenge as a Join toast too", async () => {
    mountFlow(true);
    await flushAll();
    await act(async () => {
      await fire(
        incomingChannel(),
        "postgres_changes",
        "UPDATE",
        {
          new: {
            id: "lost",
            status: "started",
            challenger_id: "me",
            opponent_id: "ana",
            created_at: new Date().toISOString(),
          },
        },
        "challenger",
      );
    });
    expect(push).not.toHaveBeenCalled();
    expect(joinToast()?.id).toBe("arena-join:lost");
  });
});
