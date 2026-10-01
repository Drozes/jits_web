import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { CHALLENGE_GONE_MESSAGE, useArenaChallenge } from "./use-arena-challenge";

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
const loc = vi.hoisted(() => ({
  captureAndReport: vi.fn(),
  locationPermission: vi.fn(),
}));
vi.mock("@/lib/location/match-location", async (orig) => ({
  ...(await orig<typeof import("@/lib/location/match-location")>()),
  ...loc,
}));

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
  loc.captureAndReport.mockResolvedValue({ ok: true });
  loc.locationPermission.mockResolvedValue("granted");
  q.getPendingChallengesForAthlete.mockResolvedValue({
    ok: true,
    data: { incoming: [], outgoing: [] },
  });
});

const proximityError = (hint: string) => ({
  ok: false,
  error: { code: "UNKNOWN", message: "too far", raw: { code: "P0001", hint } },
});

function mount(required: boolean | undefined) {
  return renderHook(() =>
    useArenaChallenge({
      athleteId: "me",
      athleteWeight: 170,
      canReceive: true,
      locationRequired: required === undefined ? undefined : async () => required,
    }),
  );
}

describe("useArenaChallenge with match_location_required", () => {
  it("flag off (or not passed): accept starts with no location step", async () => {
    for (const required of [false, undefined]) {
      vi.clearAllMocks();
      m.startMatchFromChallenge.mockResolvedValue({ ok: true, data: { match_id: "m1" } });
      m.acceptChallenge.mockResolvedValue({ ok: true, data: null });
      m.declineOtherPendingChallenges.mockResolvedValue({ ok: true, data: { declined: [], skipped: [] } });
      const { result, unmount } = mount(required);
      await insertChallenge();
      await act(() => result.current.accept());
      expect(loc.captureAndReport).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith("/arena/match/m1");
      unmount();
    }
  });

  it("flag on: reports an arena reading for the challenge before starting", async () => {
    const order: string[] = [];
    loc.captureAndReport.mockImplementation(async (_c, ctx, id) => {
      order.push(`report:${ctx}:${id}`);
      return { ok: true };
    });
    m.startMatchFromChallenge.mockImplementation(async () => {
      order.push("start");
      return { ok: true, data: { match_id: "m1" } };
    });
    const { result } = mount(true);
    await insertChallenge();
    await act(() => result.current.accept());
    expect(order).toEqual(["report:arena:c1", "start"]);
    expect(push).toHaveBeenCalledWith("/arena/match/m1");
  });

  it("denied: keeps the accepted prompt with the denied reason and does not start", async () => {
    loc.captureAndReport.mockResolvedValue({ ok: false, failure: "denied" });
    const { result } = mount(true);
    await insertChallenge();
    await act(() => result.current.accept());
    expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
    expect(result.current.incoming).toMatchObject({ challengeId: "c1", startBlocked: "denied" });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("accuracy too low: blocked with the accuracy reason", async () => {
    loc.captureAndReport.mockResolvedValue({ ok: false, failure: "accuracy" });
    const { result } = mount(true);
    await insertChallenge();
    await act(() => result.current.accept());
    expect(result.current.incoming?.startBlocked).toBe("accuracy");
  });

  it.each(["proximity_required", "proximity_failed"])(
    "HINT %s: blocked with the proximity reason, never retried, no generic toast",
    async (hint) => {
      m.startMatchFromChallenge.mockResolvedValue(proximityError(hint));
      const { result } = mount(true);
      await insertChallenge();
      await act(() => result.current.accept());
      expect(m.startMatchFromChallenge).toHaveBeenCalledTimes(1);
      expect(result.current.incoming).toMatchObject({ startBlocked: "proximity" });
      expect(toast.error).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    },
  );

  it("Retry re-reports and re-starts without a second accept", async () => {
    m.startMatchFromChallenge.mockResolvedValueOnce(proximityError("proximity_failed"));
    const { result } = mount(true);
    await insertChallenge();
    await act(() => result.current.accept());
    expect(m.acceptChallenge).toHaveBeenCalledTimes(1);
    await act(() => result.current.accept());
    expect(m.acceptChallenge).toHaveBeenCalledTimes(1);
    expect(loc.captureAndReport).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith("/arena/match/m1");
  });

  it("keeps a blocked prompt when its own accepted UPDATE lands late", async () => {
    loc.captureAndReport.mockResolvedValue({ ok: false, failure: "denied" });
    const { result } = mount(true);
    await insertChallenge();
    await act(() => result.current.accept());
    act(() => {
      fire(incomingChannel(), "postgres_changes", "UPDATE", { new: { id: "c1", status: "accepted" } });
    });
    expect(result.current.incoming?.startBlocked).toBe("denied");
    // ...but the challenger cancelling still clears it.
    act(() => {
      fire(incomingChannel(), "postgres_changes", "UPDATE", { new: { id: "c1", status: "cancelled" } });
    });
    expect(result.current.incoming).toBeNull();
  });

  it("Cancel on a blocked prompt withdraws the accepted challenge (no decline)", async () => {
    m.startMatchFromChallenge.mockResolvedValue(proximityError("proximity_required"));
    const { result } = mount(true);
    await insertChallenge();
    await act(() => result.current.accept());
    await act(() => result.current.decline());
    expect(m.declineChallenge).not.toHaveBeenCalled();
    expect(m.cancelChallenge).toHaveBeenCalledWith(expect.anything(), "c1", { onlyIfAccepted: true });
    expect(result.current.incoming).toBeNull();
  });

  it("a closed challenge at report time reads as no longer available", async () => {
    loc.captureAndReport.mockResolvedValue({
      ok: false,
      failure: null,
      report: { ok: false, code: "booking_closed" },
    });
    const { result } = mount(true);
    await insertChallenge();
    await act(() => result.current.accept());
    expect(toast.error).toHaveBeenCalledWith(CHALLENGE_GONE_MESSAGE);
    expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
    expect(result.current.incoming).toBeNull();
  });

  it("a report error otherwise still lets the server decide the start", async () => {
    loc.captureAndReport.mockResolvedValue({
      ok: false,
      failure: null,
      report: { ok: false, code: "error", hint: null },
    });
    const { result } = mount(true);
    await insertChallenge();
    await act(() => result.current.accept());
    expect(push).toHaveBeenCalledWith("/arena/match/m1");
  });

  it("sending (flag on, permission granted) reports a best-effort arena reading", async () => {
    const { result } = mount(true);
    await act(() => result.current.sendChallenge("ana", "Ana"));
    await act(async () => {});
    expect(loc.captureAndReport).toHaveBeenCalledWith(expect.anything(), "arena", "out1");
  });

  it("sending never raises a browser prompt, and does nothing with the flag off", async () => {
    loc.locationPermission.mockResolvedValue("prompt");
    const on = mount(true);
    await act(() => on.result.current.sendChallenge("ana", "Ana"));
    await act(async () => {});
    on.unmount();
    loc.locationPermission.mockResolvedValue("granted");
    const off = mount(false);
    await act(() => off.result.current.sendChallenge("ana", "Ana"));
    await act(async () => {});
    expect(loc.captureAndReport).not.toHaveBeenCalled();
  });
});

const detailError = (details: string | null) => ({
  ok: false,
  error: {
    code: "UNKNOWN",
    message: "no fresh reading",
    raw: { code: "P0001", hint: "proximity_required", details },
  },
});

describe("proximity_required DETAIL at accept (viewer is the opponent)", () => {
  it.each([
    ["opponent", "self_location"],
    ["challenger", "peer_location"],
    ["both", "proximity"],
    [null, "proximity"],
  ])("DETAIL %s blocks with %s, never retried", async (details, block) => {
    m.startMatchFromChallenge.mockResolvedValue(detailError(details));
    const { result } = mount(true);
    await insertChallenge();
    await act(() => result.current.accept());
    expect(m.startMatchFromChallenge).toHaveBeenCalledTimes(1);
    expect(result.current.incoming).toMatchObject({ challengeId: "c1", startBlocked: block });
    expect(toast.error).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("implausible movement at accept: blocked, no start, no automatic re-report", async () => {
    loc.captureAndReport.mockResolvedValue({ ok: false, failure: "implausible" });
    const { result } = mount(true);
    await insertChallenge();
    await act(() => result.current.accept());
    await act(async () => {});
    expect(result.current.incoming?.startBlocked).toBe("implausible");
    expect(loc.captureAndReport).toHaveBeenCalledTimes(1);
    expect(m.startMatchFromChallenge).not.toHaveBeenCalled();
  });
});

describe("waiting challenger keeps an arena reading fresh (M1)", () => {
  let visibility: DocumentVisibilityState = "visible";
  const setVisibility = (v: DocumentVisibilityState) => {
    visibility = v;
    document.dispatchEvent(new Event("visibilitychange"));
  };
  const arenaReports = () =>
    loc.captureAndReport.mock.calls.filter((c) => c[1] === "arena" && c[2] === "out1").length;
  const tick = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function send(required: boolean) {
    const hook = mount(required);
    await act(() => hook.result.current.sendChallenge("ana", "Ana"));
    await act(async () => {});
    return hook;
  }

  it("reports at send, then every 60 s while waiting", async () => {
    await send(true);
    expect(arenaReports()).toBe(1);
    await tick(59_000);
    expect(arenaReports()).toBe(1);
    await tick(1_000);
    expect(arenaReports()).toBe(2);
    await tick(60_000);
    expect(arenaReports()).toBe(3);
  });

  it("stops while hidden and reports at once when the tab comes back", async () => {
    await send(true);
    act(() => setVisibility("hidden"));
    await tick(180_000);
    expect(arenaReports()).toBe(1);
    act(() => setVisibility("visible"));
    await act(async () => {});
    expect(arenaReports()).toBe(2);
    await tick(60_000);
    expect(arenaReports()).toBe(3);
  });

  it("only with permission already granted, never a prompt", async () => {
    loc.locationPermission.mockResolvedValue("unknown");
    await send(true);
    // The send-time best-effort report still runs on unknown; the waiting
    // refresher needs granted.
    const atSend = arenaReports();
    await tick(180_000);
    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    await act(async () => {});
    expect(arenaReports()).toBe(atSend);
  });

  it("never runs with the flag off", async () => {
    await send(false);
    await tick(180_000);
    expect(loc.captureAndReport).not.toHaveBeenCalled();
  });

  it("stops once the bar clears (cancelled)", async () => {
    const { result } = await send(true);
    await act(() => result.current.cancelOutgoing());
    expect(result.current.outgoing).toBeNull();
    await tick(180_000);
    expect(arenaReports()).toBe(1);
  });

  it("a failed reading (implausible) waits for the next tick, no tight loop", async () => {
    loc.captureAndReport.mockResolvedValue({ ok: false, failure: "implausible" });
    await send(true);
    await tick(30_000);
    expect(arenaReports()).toBe(1);
    await tick(30_000);
    expect(arenaReports()).toBe(2);
  });

  it("a restored bar (after a reload) reports at once, then every 60 s", async () => {
    q.getPendingChallengesForAthlete.mockResolvedValue({
      ok: true,
      data: {
        incoming: [],
        outgoing: [
          {
            challengeId: "out1",
            challengerId: "me",
            opponentId: "ana",
            opponentName: "Ana",
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });
    const { result } = mount(true);
    await act(async () => {});
    await act(async () => {});
    expect(result.current.outgoing?.challengeId).toBe("out1");
    expect(arenaReports()).toBe(1);
    await tick(60_000);
    expect(arenaReports()).toBe(2);
  });
});
