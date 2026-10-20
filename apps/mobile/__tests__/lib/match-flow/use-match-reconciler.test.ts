/**
 * WHEN the wizard re-reads the match (lib/match-flow/use-match-reconciler.ts):
 * step mount, foreground, channel (re)join, the `matches` row listener, and a
 * poll that runs only on waiting steps. Plus: one fetch in flight, a stale
 * response is dropped, disabled means silent. Timekeeper mode (M1, PM1,
 * review tech M7): the row listener is live (an UPDATE re-reads), its channel
 * is rebuilt after a server close (jits-fa9x), and a timekeeper-mode match
 * also polls crew, weight and the timekeeper's summary, and the seated
 * timekeeper reads the confirmations through `get_match_details` (the
 * `match_confirmations` RLS hides them from a non-participant).
 * Beads: jits-vh7m (foreground), jits-bmei (rejoin + poll), jits-wfpo (poll).
 */
import { AppState } from "react-native";
import { act, renderHook } from "@testing-library/react-native";

interface MockChannel {
  topic: string;
  binding: unknown;
  status: ((s: string) => void) | null;
}
const mockRow: { handler: (() => void) | null; built: MockChannel[]; registry: Set<unknown> } = {
  handler: null,
  built: [],
  registry: new Set(),
};
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: (topic: string) => {
      const chan: Record<string, unknown> & MockChannel = { topic, binding: null, status: null };
      chan.on = (_e: string, binding: unknown, handler: () => void) => {
        chan.binding = binding;
        mockRow.handler = handler;
        return chan;
      };
      chan.subscribe = (cb?: (s: string) => void) => {
        chan.status = cb ?? null;
        return chan;
      };
      mockRow.built.push(chan);
      mockRow.registry.add(chan);
      return chan;
    },
    getChannels: () => [...mockRow.registry],
    removeChannel: async (chan: unknown) => {
      mockRow.registry.delete(chan);
      return undefined;
    },
  },
}));

const mockGetMatchDetails = jest.fn();
const mockGetMatchConfirmations = jest.fn();
const mockGetMatchDetailsWithConfirmations = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
  getMatchConfirmations: (...a: unknown[]) => mockGetMatchConfirmations(...a),
  getMatchDetailsWithConfirmations: (...a: unknown[]) => mockGetMatchDetailsWithConfirmations(...a),
}));

import { useMatchReconciler } from "@/lib/match-flow/use-match-reconciler";
import { CHANNEL_LOSS_RETRY_DELAYS_MS } from "@/lib/supabase/supervise-channel";
import type { MatchStep } from "@/lib/match-flow/step-router";
import type { ReconcileRoles } from "@/lib/match-flow/reconcile";

type AppStateHandler = (s: string) => void;
let appStateHandler: AppStateHandler | null = null;

function row(status: string) {
  return { id: "M1", status, participants: [] };
}

/** Let the reconciler's async fetch settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

type Roles = Pick<ReconcileRoles, "mode" | "viewer"> | null;

function setup(step: MatchStep | null, enabled = true, roles: Roles = null) {
  const onSnapshot = jest.fn();
  const hook = renderHook(
    ({ s, e }: { s: MatchStep | null; e: boolean }) =>
      useMatchReconciler({ matchId: "M1", step: s, enabled: e, roles, onSnapshot }),
    { initialProps: { s: step, e: enabled } },
  );
  return { onSnapshot, ...hook };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRow.handler = null;
  mockRow.built = [];
  mockRow.registry.clear();
  appStateHandler = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, h: AppStateHandler) => {
    appStateHandler = h;
    return { remove: jest.fn() };
  }) as never);
  mockGetMatchDetails.mockResolvedValue(row("in_progress"));
  mockGetMatchConfirmations.mockResolvedValue([]);
  mockGetMatchDetailsWithConfirmations.mockResolvedValue({ match: row("in_progress"), confirmations: [] });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useMatchReconciler triggers", () => {
  it("(d) fetches on mount and hands over match + confirmations", async () => {
    mockGetMatchConfirmations.mockResolvedValue(["opp-1"]);
    const { onSnapshot } = setup("weight");
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(onSnapshot).toHaveBeenCalledWith({
      match: row("in_progress"),
      confirmedAthleteIds: ["opp-1"],
    });
  });

  it("(d) fetches again on every step change", async () => {
    const { rerender } = setup("weight");
    await flush();
    rerender({ s: "ready", e: true });
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(2);
  });

  it("does nothing while disabled (match not loaded / not a participant)", async () => {
    const { onSnapshot } = setup("confirm", false);
    await flush();
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    await flush();
    expect(mockGetMatchDetails).not.toHaveBeenCalled();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("(a) fetches when the app returns to the foreground (jits-vh7m)", async () => {
    setup("weight");
    await flush();
    mockGetMatchDetails.mockClear();
    act(() => appStateHandler?.("background"));
    act(() => appStateHandler?.("active"));
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(1);
  });

  it("(b) fetches when a step channel reports SUBSCRIBED (join or rejoin, jits-bmei)", async () => {
    const { result } = setup("weight");
    await flush();
    mockGetMatchDetails.mockClear();
    act(() => result.current.onChannelStatus("CHANNEL_ERROR"));
    await flush();
    expect(mockGetMatchDetails).not.toHaveBeenCalled();
    act(() => result.current.onChannelStatus("SUBSCRIBED"));
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(1);
  });

  it("(e) fetches when the matches row listener fires", async () => {
    setup("weight");
    await flush();
    mockGetMatchDetails.mockClear();
    act(() => mockRow.handler?.());
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(1);
  });
});

describe("useMatchReconciler polling", () => {
  it.each<MatchStep>(["ready", "result", "confirm"])("polls on the waiting step %s", async (step) => {
    setup(step);
    await flush();
    mockGetMatchDetails.mockClear();
    for (let i = 0; i < 3; i++) {
      act(() => {
        jest.advanceTimersByTime(4_000);
      });
      await flush();
    }
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(3);
  });

  it("polls live slowly", async () => {
    setup("live");
    await flush();
    mockGetMatchDetails.mockClear();
    act(() => {
      jest.advanceTimersByTime(9_000);
    });
    await flush();
    expect(mockGetMatchDetails).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(1);
  });

  it.each<MatchStep>(["weight", "end", "summary"])("never polls on %s", async (step) => {
    setup(step);
    await flush();
    mockGetMatchDetails.mockClear();
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    await flush();
    expect(mockGetMatchDetails).not.toHaveBeenCalled();
  });

  it("stops polling when the step stops waiting", async () => {
    const { rerender } = setup("confirm");
    await flush();
    rerender({ s: "summary", e: true });
    await flush();
    mockGetMatchDetails.mockClear();
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    await flush();
    expect(mockGetMatchDetails).not.toHaveBeenCalled();
  });

  it("pauses polling in the background and resumes in the foreground", async () => {
    setup("confirm");
    await flush();
    act(() => appStateHandler?.("background"));
    mockGetMatchDetails.mockClear();
    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    await flush();
    expect(mockGetMatchDetails).not.toHaveBeenCalled();
    act(() => appStateHandler?.("active"));
    await flush();
    act(() => {
      jest.advanceTimersByTime(4_000);
    });
    await flush();
    // One for the foreground trigger, one for the resumed poll.
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(2);
  });
});

describe("useMatchReconciler ordering", () => {
  it("keeps one fetch in flight and runs exactly one trailing fetch for triggers that land meanwhile", async () => {
    let release: (v: unknown) => void = () => {};
    mockGetMatchDetails.mockImplementationOnce(
      () => new Promise((res) => {
        release = res;
      }),
    );
    const { result, onSnapshot } = setup("weight");
    // Three triggers while the first read is still out.
    act(() => {
      result.current.reconcileNow();
      result.current.reconcileNow();
      result.current.onChannelStatus("SUBSCRIBED");
    });
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(1);
    mockGetMatchDetails.mockResolvedValue(row("completed"));
    await act(async () => {
      release(row("in_progress"));
    });
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(2);
    expect(onSnapshot.mock.calls.map((c) => c[0].match.status)).toEqual(["in_progress", "completed"]);
  });

  it("drops a snapshot when the match read returns nothing", async () => {
    mockGetMatchDetails.mockResolvedValue(null);
    const { onSnapshot } = setup("confirm");
    await flush();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("reports unknown confirmations as null, not as 'nobody confirmed'", async () => {
    mockGetMatchConfirmations.mockResolvedValue(null);
    const { onSnapshot } = setup("confirm");
    await flush();
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ confirmedAthleteIds: null }));
  });

  it("survives a failing read and tries again on the next trigger", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockGetMatchDetails.mockRejectedValueOnce(new Error("offline"));
    const { result, onSnapshot } = setup("weight");
    await flush();
    expect(onSnapshot).not.toHaveBeenCalled();
    act(() => result.current.reconcileNow());
    await flush();
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("never delivers a snapshot after unmount", async () => {
    let release: (v: unknown) => void = () => {};
    mockGetMatchDetails.mockImplementationOnce(
      () => new Promise((res) => {
        release = res;
      }),
    );
    const { onSnapshot, unmount } = setup("confirm");
    unmount();
    await act(async () => {
      release(row("completed"));
    });
    await flush();
    expect(onSnapshot).not.toHaveBeenCalled();
  });
});

describe("useMatchReconciler: the matches row channel (PM1, jits-fa9x)", () => {
  it("listens for UPDATEs of this match row and re-reads on each (the listener is live)", async () => {
    setup("weight");
    await flush();
    const chan = mockRow.built[mockRow.built.length - 1];
    expect(chan.topic).toMatch(/^match-row:M1:\d+$/);
    expect(chan.binding).toEqual({ event: "UPDATE", schema: "public", table: "matches", filter: "id=eq.M1" });
    mockGetMatchDetails.mockClear();
    act(() => mockRow.handler?.());
    act(() => mockRow.handler?.());
    await flush();
    // Two events, one read in flight then one trailing read.
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(2);
  });

  it("a row event only re-reads: the snapshot it hands over is the fresh read", async () => {
    const { onSnapshot } = setup("confirm");
    await flush();
    mockGetMatchDetails.mockResolvedValue(row("completed"));
    act(() => mockRow.handler?.());
    await flush();
    expect(onSnapshot).toHaveBeenLastCalledWith({ match: row("completed"), confirmedAthleteIds: [] });
  });

  it("does not re-read on the first SUBSCRIBED (the mount read covers it)", async () => {
    setup("weight");
    await flush();
    mockGetMatchDetails.mockClear();
    act(() => mockRow.built[0].status?.("SUBSCRIBED"));
    await flush();
    expect(mockGetMatchDetails).not.toHaveBeenCalled();
  });

  it("rebuilds the channel after a server close and re-reads once it is back", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    setup("weight");
    await flush();
    const first = mockRow.built[0];
    act(() => first.status?.("SUBSCRIBED"));
    // The server closed it: out of the registry, then CLOSED.
    mockRow.registry.delete(first);
    act(() => first.status?.("CLOSED"));
    expect(mockRow.built).toHaveLength(1);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(mockRow.built).toHaveLength(2);
    expect(mockRow.built[1].topic).not.toBe(first.topic);
    mockGetMatchDetails.mockClear();
    act(() => mockRow.built[1].status?.("SUBSCRIBED"));
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("never gives up: past the delay table it keeps rebuilding at the last delay (no foreground restarts it)", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    setup("ready");
    await flush();
    const last = CHANNEL_LOSS_RETRY_DELAYS_MS[CHANNEL_LOSS_RETRY_DELAYS_MS.length - 1];
    // Every delay in the table, then three more losses at the last delay.
    const delays = [...CHANNEL_LOSS_RETRY_DELAYS_MS, last, last, last];
    for (const [i, delay] of delays.entries()) {
      const chan = mockRow.built[mockRow.built.length - 1];
      mockRow.registry.delete(chan);
      act(() => chan.status?.("CLOSED"));
      act(() => {
        jest.advanceTimersByTime(delay);
      });
      expect([i, mockRow.built.length]).toEqual([i, i + 2]);
    }
    // The match screen is held awake, so no foreground would ever restart a
    // channel that gave up: the supervisor registers no foreground listener.
    expect(warn.mock.calls.some(([m]) => String(m).includes("gave up"))).toBe(false);
    warn.mockRestore();
  });

  it("leaves a channel phoenix is rejoining alone (CLOSED while still registered)", async () => {
    setup("weight");
    await flush();
    act(() => mockRow.built[0].status?.("CLOSED"));
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(mockRow.built).toHaveLength(1);
  });

  it("removes its channel on unmount", async () => {
    const { unmount } = setup("weight");
    await flush();
    expect(mockRow.registry.size).toBe(1);
    unmount();
    expect(mockRow.registry.size).toBe(0);
  });

  it("opens no channel while disabled", async () => {
    setup("weight", false);
    await flush();
    expect(mockRow.built).toHaveLength(0);
  });
});

describe("useMatchReconciler: timekeeper-mode polls (review tech M7)", () => {
  const ATHLETE: Roles = { mode: "timekeeper", viewer: "challenger" };
  const TIMEKEEPER: Roles = { mode: "timekeeper", viewer: "timekeeper" };

  /** Match reads in three intervals: the timekeeper's come with the confirmations. */
  async function pollsIn(step: MatchStep, roles: Roles, ms: number): Promise<number> {
    setup(step, true, roles);
    await flush();
    mockGetMatchDetails.mockClear();
    mockGetMatchDetailsWithConfirmations.mockClear();
    for (let i = 0; i < 3; i++) {
      act(() => {
        jest.advanceTimersByTime(ms);
      });
      await flush();
    }
    return mockGetMatchDetails.mock.calls.length + mockGetMatchDetailsWithConfirmations.mock.calls.length;
  }

  it.each<MatchStep>(["crew", "weight"])("an athlete on %s polls every 4 s", async (step) => {
    expect(await pollsIn(step, ATHLETE, 4_000)).toBe(3);
  });

  it("the timekeeper's face-off (weight) polls every 4 s", async () => {
    expect(await pollsIn("weight", TIMEKEEPER, 4_000)).toBe(3);
  });

  it("the timekeeper's done screen polls every 4 s", async () => {
    expect(await pollsIn("summary", TIMEKEEPER, 4_000)).toBe(3);
  });

  it("an athlete's summary does not poll", async () => {
    expect(await pollsIn("summary", ATHLETE, 20_000)).toBe(0);
  });

  it("a two-athlete weight step still never polls, with or without roles", async () => {
    expect(await pollsIn("weight", { mode: "self_run", viewer: "challenger" }, 20_000)).toBe(0);
  });
});

describe("useMatchReconciler: where the confirmations come from", () => {
  const TIMEKEEPER: Roles = { mode: "timekeeper", viewer: "timekeeper" };

  it("the seated timekeeper takes them from get_match_details, never the table its RLS hides them in", async () => {
    // RLS: the table reads [] for the timekeeper; the details read lists them.
    mockGetMatchConfirmations.mockResolvedValue([]);
    mockGetMatchDetailsWithConfirmations.mockResolvedValue({
      match: row("completed"),
      confirmations: [{ athlete_id: "opp-1", confirmed_at: "T" }],
    });
    const { onSnapshot } = setup("summary", true, TIMEKEEPER);
    await flush();
    expect(onSnapshot).toHaveBeenCalledWith({ match: row("completed"), confirmedAthleteIds: ["opp-1"] });
    expect(mockGetMatchDetailsWithConfirmations).toHaveBeenCalledWith(expect.anything(), "M1");
    // One read: neither the plain match read nor the table read.
    expect(mockGetMatchDetails).not.toHaveBeenCalled();
    expect(mockGetMatchConfirmations).not.toHaveBeenCalled();
  });

  it("the timekeeper's summary poll re-reads them", async () => {
    mockGetMatchDetailsWithConfirmations.mockResolvedValue({ match: row("completed"), confirmations: [] });
    const { onSnapshot } = setup("summary", true, TIMEKEEPER);
    await flush();
    mockGetMatchDetailsWithConfirmations.mockResolvedValue({
      match: row("completed"),
      confirmations: [{ athlete_id: "me-1", confirmed_at: "T" }],
    });
    act(() => {
      jest.advanceTimersByTime(4_000);
    });
    await flush();
    expect(onSnapshot).toHaveBeenLastCalledWith({ match: row("completed"), confirmedAthleteIds: ["me-1"] });
  });

  it("a read with no confirmations array is unknown (null) for the timekeeper", async () => {
    mockGetMatchDetailsWithConfirmations.mockResolvedValue({ match: row("completed"), confirmations: null });
    const { onSnapshot } = setup("summary", true, TIMEKEEPER);
    await flush();
    expect(onSnapshot).toHaveBeenCalledWith({ match: row("completed"), confirmedAthleteIds: null });
  });

  it("a failed details read hands over nothing for the timekeeper", async () => {
    mockGetMatchDetailsWithConfirmations.mockResolvedValue(null);
    const { onSnapshot } = setup("summary", true, TIMEKEEPER);
    await flush();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it.each<[string, Roles]>([
    ["a timekeeper-mode athlete", { mode: "timekeeper", viewer: "challenger" }],
    ["a two-athlete match", { mode: "self_run", viewer: "opponent" }],
    ["no roles", null],
  ])("%s reads the table next to the match, as always", async (_label, roles) => {
    mockGetMatchConfirmations.mockResolvedValue(["opp-1"]);
    const { onSnapshot } = setup("confirm", true, roles);
    await flush();
    expect(onSnapshot).toHaveBeenCalledWith({ match: row("in_progress"), confirmedAthleteIds: ["opp-1"] });
    expect(mockGetMatchDetails).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(mockGetMatchConfirmations).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(mockGetMatchDetailsWithConfirmations).not.toHaveBeenCalled();
  });
});
