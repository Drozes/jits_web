/**
 * WHEN the wizard re-reads the match (lib/match-flow/use-match-reconciler.ts):
 * step mount, foreground, channel (re)join, the `matches` row listener, and a
 * poll that runs only on waiting steps. Plus: one fetch in flight, a stale
 * response is dropped, disabled means silent.
 * Beads: jits-vh7m (foreground), jits-bmei (rejoin + poll), jits-wfpo (poll).
 */
import { AppState } from "react-native";
import { act, renderHook } from "@testing-library/react-native";

const mockRow: { handler: (() => void) | null } = { handler: null };
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: () => {
      const chan: Record<string, unknown> = {};
      chan.on = (_e: string, _f: unknown, handler: () => void) => {
        mockRow.handler = handler;
        return chan;
      };
      chan.subscribe = () => chan;
      return chan;
    },
    removeChannel: async () => undefined,
  },
}));

const mockGetMatchDetails = jest.fn();
const mockGetMatchConfirmations = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
  getMatchConfirmations: (...a: unknown[]) => mockGetMatchConfirmations(...a),
}));

import { useMatchReconciler } from "@/lib/match-flow/use-match-reconciler";
import type { MatchStep } from "@/lib/match-flow/step-router";

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

function setup(step: MatchStep | null, enabled = true) {
  const onSnapshot = jest.fn();
  const hook = renderHook(
    ({ s, e }: { s: MatchStep | null; e: boolean }) =>
      useMatchReconciler({ matchId: "M1", step: s, enabled: e, onSnapshot }),
    { initialProps: { s: step, e: enabled } },
  );
  return { onSnapshot, ...hook };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRow.handler = null;
  appStateHandler = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, h: AppStateHandler) => {
    appStateHandler = h;
    return { remove: jest.fn() };
  }) as never);
  mockGetMatchDetails.mockResolvedValue(row("in_progress"));
  mockGetMatchConfirmations.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useMatchReconciler triggers", () => {
  it("(d) fetches on mount and hands over match + confirmations", async () => {
    mockGetMatchConfirmations.mockResolvedValue(["opp-1"]);
    const sentAt = 1_234_567;
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(sentAt);
    const { onSnapshot } = setup("weight");
    await flush();
    expect(mockGetMatchDetails).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(onSnapshot).toHaveBeenCalledWith({
      match: row("in_progress"),
      confirmedAthleteIds: ["opp-1"],
      sentAt,
    });
    nowSpy.mockRestore();
  });

  it("stamps each snapshot with the time its read was SENT, not when it landed (jits-igku)", async () => {
    let now = 5_000;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
    let release: ((m: unknown) => void) | null = null;
    mockGetMatchDetails.mockImplementationOnce(
      () => new Promise((res) => {
        release = res;
      }),
    );
    const { onSnapshot } = setup("weight");
    await flush();
    now = 60_000; // a slow read: lands long after it was issued
    release!(row("in_progress"));
    await flush();
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ sentAt: 5_000 }));
    nowSpy.mockRestore();
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
