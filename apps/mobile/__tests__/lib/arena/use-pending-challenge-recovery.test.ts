/**
 * Closing the "challenge arrived while nobody was listening" gap.
 *
 * A realtime INSERT that lands while the app is suspended is never delivered,
 * so pending challenges are READ at mount, on going live and on return from
 * the background. What gets offered is narrower than "pending" on purpose: a
 * live prompt promises "you both drop straight into the match", which is only
 * true while the challenger is still in the lobby.
 */
import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

const mockGetPending = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getPendingChallengesForAthlete: (...a: unknown[]) => mockGetPending(...a),
}));
const mockSweep = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  cancelStaleOutgoingChallenges: (...a: unknown[]) => mockSweep(...a),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import {
  PENDING_PROMPT_MAX_AGE_MS,
  isFreshPending,
  keepsPreference,
  requestPendingChallengeResync,
  usePendingChallengeRecovery,
  type UsePendingChallengeRecoveryArgs,
} from "@/lib/arena/use-pending-challenge-recovery";
import {
  __resetServerClockForTests,
  noteServerTime,
} from "@/lib/arena/incoming-challenges";
import { notifyIncomingChallengeEnded } from "@/lib/arena/arena-store";

const ME = "me-1";
const NOW = Date.parse("2026-09-25T12:00:00Z");

function pending(over: Record<string, unknown> = {}) {
  return {
    challengeId: "ch-1",
    challengerId: "rival-1",
    opponentId: ME,
    challengerName: "Rival",
    opponentName: "Me",
    matchType: "ranked",
    createdAt: new Date(NOW - 60_000).toISOString(),
    expiresAt: new Date(NOW + 7 * 86_400_000).toISOString(),
    challengerWeight: 190,
    opponentWeight: null,
    ...over,
  };
}

function reply(incoming: unknown[] = [], outgoing: unknown[] = []) {
  mockGetPending.mockResolvedValue({ ok: true, data: { incoming, outgoing } });
}

const mockOffer = jest.fn();
const mockRestore = jest.fn();
let appStateHandler: ((s: AppStateStatus) => void) | null = null;

function baseArgs(
  over: Partial<UsePendingChallengeRecoveryArgs> = {},
): UsePendingChallengeRecoveryArgs {
  return {
    athleteId: ME,
    isLive: true,
    hasIncoming: false,
    lobbyIds: new Set(["rival-1"]),
    offerIncoming: mockOffer,
    restoreOutgoing: mockRestore,
    ...over,
  };
}

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

function mount(over: Partial<UsePendingChallengeRecoveryArgs> = {}) {
  return renderHook(
    (props: UsePendingChallengeRecoveryArgs) => usePendingChallengeRecovery(props),
    { initialProps: baseArgs(over) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetServerClockForTests();
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  mockOffer.mockResolvedValue("raised");
  mockSweep.mockResolvedValue({ ok: true, data: { cancelled: [] } });
  reply();
  appStateHandler = null;
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event: string, handler: unknown) => {
      appStateHandler = handler as (s: AppStateStatus) => void;
      return { remove: jest.fn() } as never;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("isFreshPending", () => {
  it("accepts a recent, unexpired challenge", () => {
    expect(isFreshPending(pending() as never, NOW)).toBe(true);
  });

  it("rejects one older than the live-prompt window", () => {
    const old = pending({
      createdAt: new Date(NOW - PENDING_PROMPT_MAX_AGE_MS - 1).toISOString(),
    });
    expect(isFreshPending(old as never, NOW)).toBe(false);
  });

  it("rejects an expired one even when it is recent", () => {
    const expired = pending({ expiresAt: new Date(NOW - 1).toISOString() });
    expect(isFreshPending(expired as never, NOW)).toBe(false);
  });

  it("judges freshness on the server's clock when this device runs fast", () => {
    // Created 60s ago by the server; this device is 15 minutes ahead.
    const skew = 15 * 60_000;
    noteServerTime(new Date(NOW - skew).toISOString(), NOW, "roundtrip");
    const c = pending({ createdAt: new Date(NOW - skew - 60_000).toISOString() });
    expect(isFreshPending(c as never, NOW)).toBe(true);
    expect(isFreshPending(c as never, NOW + PENDING_PROMPT_MAX_AGE_MS)).toBe(false);
  });

  it("sweeps my stale outgoing challenges on the server's clock too", async () => {
    const skew = 15 * 60_000;
    noteServerTime(new Date(NOW - skew).toISOString(), NOW, "roundtrip");
    mount();
    await act(flush);
    expect(mockSweep).toHaveBeenCalledWith(
      expect.anything(),
      ME,
      expect.objectContaining({ now: NOW - skew }),
    );
  });

  it("a late INSERT does not make a stale challenge fresh", () => {
    // Calibrated earlier (that sample has aged out of the window); created
    // 11 minutes ago; then an INSERT flushed four minutes late.
    noteServerTime(new Date(NOW - 20 * 60_000).toISOString(), NOW - 20 * 60_000);
    noteServerTime(new Date(NOW - 240_000).toISOString(), NOW);
    const c = pending({
      createdAt: new Date(NOW - PENDING_PROMPT_MAX_AGE_MS - 60_000).toISOString(),
    });
    expect(isFreshPending(c as never, NOW)).toBe(false);
  });

  it("rejects unparseable timestamps rather than guessing", () => {
    expect(isFreshPending(pending({ createdAt: "nope" }) as never, NOW)).toBe(false);
  });
});

describe("reading pending challenges", () => {
  it("reads them at mount for this athlete", async () => {
    mount({ isLive: false });
    await act(flush);

    expect(mockGetPending).toHaveBeenCalledTimes(1);
    expect(mockGetPending).toHaveBeenCalledWith({}, ME);
  });

  it("reads again when the athlete goes live", async () => {
    const { rerender } = mount({ isLive: false });
    await act(flush);
    mockGetPending.mockClear();

    await act(async () => {
      rerender(baseArgs({ isLive: true }));
      await flush();
    });

    expect(mockGetPending).toHaveBeenCalledTimes(1);
  });

  it("reads again on return from the background, not on 'inactive'", async () => {
    mount();
    await act(flush);
    mockGetPending.mockClear();

    await act(async () => {
      appStateHandler?.("inactive");
      appStateHandler?.("active");
      await flush();
    });
    expect(mockGetPending).not.toHaveBeenCalled();

    await act(async () => {
      appStateHandler?.("background");
      appStateHandler?.("active");
      await flush();
    });
    expect(mockGetPending).toHaveBeenCalledTimes(1);
  });

  it("survives a failed read without offering anything", async () => {
    mockGetPending.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "down" },
    });
    mount();
    await act(flush);

    expect(mockOffer).not.toHaveBeenCalled();
    expect(mockRestore).not.toHaveBeenCalled();
  });
});

describe("offering an incoming challenge", () => {
  it("offers the oldest of several fresh challenges (spec 4.3, first arrival)", async () => {
    reply([
      pending({
        challengeId: "ch-newest",
        challengerId: "rival-1",
        createdAt: new Date(NOW - 1_000).toISOString(),
      }),
      pending({
        challengeId: "ch-middle",
        challengerId: "rival-1",
        createdAt: new Date(NOW - 2_000).toISOString(),
      }),
      pending({
        challengeId: "ch-oldest",
        challengerId: "rival-1",
        createdAt: new Date(NOW - 3_000).toISOString(),
      }),
    ]);
    mount();
    await act(flush);

    expect(mockOffer).toHaveBeenCalledTimes(1);
    expect(mockOffer).toHaveBeenCalledWith(
      "ch-oldest",
      "rival-1",
      expect.objectContaining({ createdAt: expect.any(String) }),
    );
  });

  it("offers the oldest even when the read comes back oldest first", async () => {
    reply([
      pending({
        challengeId: "ch-oldest",
        createdAt: new Date(NOW - 3_000).toISOString(),
      }),
      pending({
        challengeId: "ch-newest",
        createdAt: new Date(NOW - 1_000).toISOString(),
      }),
    ]);
    mount();
    await act(flush);

    expect(mockOffer).toHaveBeenCalledTimes(1);
    expect(mockOffer).toHaveBeenCalledWith(
      "ch-oldest",
      "rival-1",
      expect.objectContaining({ createdAt: expect.any(String) }),
    );
  });

  it("offers the oldest fresh challenge whose challenger is in the lobby", async () => {
    reply([
      pending({ challengeId: "ch-1", challengerId: "rival-1" }),
      pending({
        challengeId: "ch-old",
        challengerId: "gone-1",
        createdAt: new Date(NOW - 120_000).toISOString(),
      }),
    ]);
    mount();
    await act(flush);

    // The oldest one's challenger has left, so it is skipped for the next.
    expect(mockOffer).toHaveBeenCalledTimes(1);
    expect(mockOffer).toHaveBeenCalledWith("ch-1", "rival-1", expect.objectContaining({ createdAt: expect.any(String) }));
  });

  it("does not offer anything to an athlete who is not live", async () => {
    reply([pending()]);
    mount({ isLive: false });
    await act(flush);

    expect(mockOffer).not.toHaveBeenCalled();
  });

  it("does not offer a stale challenge", async () => {
    reply([
      pending({
        createdAt: new Date(NOW - PENDING_PROMPT_MAX_AGE_MS - 1).toISOString(),
      }),
    ]);
    mount();
    await act(flush);

    expect(mockOffer).not.toHaveBeenCalled();
  });

  it("offers once the challenger's presence syncs in", async () => {
    // The lobby is usually still empty on the first frame after mount.
    reply([pending()]);
    const { rerender } = mount({ lobbyIds: new Set() });
    await act(flush);
    expect(mockOffer).not.toHaveBeenCalled();

    await act(async () => {
      rerender(baseArgs({ lobbyIds: new Set(["rival-1"]) }));
      await flush();
    });

    expect(mockOffer).toHaveBeenCalledWith("ch-1", "rival-1", expect.objectContaining({ createdAt: expect.any(String) }));
  });

  it("offers nothing from a lobby outage's stale ids until a sync vouches again", async () => {
    // Known with rival-1, then TIMED_OUT: the ids are kept but not known. A
    // resync read that lists rival-1's challenge must not raise a prompt for
    // a challenger who may have left during the outage.
    reply([]);
    const { rerender } = mount({ lobbyIds: new Set(["rival-1"]), lobbyKnown: true });
    await act(flush);
    const stale = new Set(["rival-1"]);
    await act(async () => {
      rerender(baseArgs({ lobbyIds: stale, lobbyKnown: false }));
      await flush();
    });
    reply([pending()]);
    const readsBefore = mockGetPending.mock.calls.length;
    await act(async () => {
      requestPendingChallengeResync();
      await flush();
    });
    expect(mockGetPending.mock.calls.length).toBeGreaterThan(readsBefore);
    expect(mockOffer).not.toHaveBeenCalled();

    // The rejoin's sync publishes a new, known set that still has rival-1.
    await act(async () => {
      rerender(baseArgs({ lobbyIds: new Set(["rival-1"]), lobbyKnown: true }));
      await flush();
    });
    expect(mockOffer).toHaveBeenCalledTimes(1);
    expect(mockOffer).toHaveBeenCalledWith("ch-1", "rival-1", expect.anything());
  });

  it("never offers over a prompt that is already up", async () => {
    reply([pending()]);
    mount({ hasIncoming: true });
    await act(flush);

    expect(mockOffer).not.toHaveBeenCalled();
  });

  it("offers each challenge only once, however often presence syncs", async () => {
    reply([pending()]);
    const { rerender } = mount();
    await act(flush);

    await act(async () => {
      rerender(baseArgs({ lobbyIds: new Set(["rival-1", "x"]) }));
      rerender(baseArgs({ lobbyIds: new Set(["rival-1", "y"]) }));
      await flush();
    });

    expect(mockOffer).toHaveBeenCalledTimes(1);
  });
});

describe("offer-time checks", () => {
  it("offers nothing while in a match", async () => {
    reply([pending()]);
    mount({ inMatch: true });
    await act(flush);

    expect(mockOffer).not.toHaveBeenCalled();
  });

  it("re-checks freshness when presence syncs long after the read", async () => {
    // Fresh at fetch time, but the challenger's presence only syncs in after
    // the live-prompt window has passed: no longer a live prompt.
    reply([pending()]);
    const { rerender } = mount({ lobbyIds: new Set() });
    await act(flush);

    (Date.now as jest.Mock).mockReturnValue(NOW + PENDING_PROMPT_MAX_AGE_MS);
    await act(async () => {
      rerender(baseArgs({ lobbyIds: new Set(["rival-1"]) }));
      await flush();
    });

    expect(mockOffer).not.toHaveBeenCalled();
  });
});

describe("restoring my own outgoing challenge", () => {
  it("restores the newest fresh outgoing challenge", async () => {
    reply(
      [],
      [
        pending({
          challengeId: "out-1",
          challengerId: ME,
          opponentId: "opp-1",
          opponentName: "Opp",
        }),
      ],
    );
    mount({ isLive: false });
    await act(flush);

    expect(mockRestore).toHaveBeenCalledWith({
      challengeId: "out-1",
      opponentId: "opp-1",
      opponentName: "Opp",
      expiresAt: new Date(NOW + 7 * 86_400_000).toISOString(),
      createdAt: expect.any(String),
    });
  });

  it("does not restore a stale one", async () => {
    reply(
      [],
      [
        pending({
          challengeId: "out-1",
          challengerId: ME,
          opponentId: "opp-1",
          createdAt: new Date(NOW - PENDING_PROMPT_MAX_AGE_MS - 1).toISOString(),
        }),
      ],
    );
    mount();
    await act(flush);

    expect(mockRestore).not.toHaveBeenCalled();
  });
});

describe("withdrawing my own stale outgoing challenges (jits-celf)", () => {
  const STALE = () =>
    pending({
      challengeId: "old-1",
      challengerId: ME,
      opponentId: "opp-1",
      createdAt: new Date(NOW - PENDING_PROMPT_MAX_AGE_MS - 1).toISOString(),
    });

  it("sweeps on mount, reusing the read and keeping the challenge on my plate", async () => {
    const outgoing = [STALE()];
    reply([], outgoing);
    mount({ isLive: false, outgoingChallengeId: "on-plate" });
    await act(flush);

    expect(mockSweep).toHaveBeenCalledTimes(1);
    expect(mockSweep).toHaveBeenCalledWith({}, ME, {
      outgoing,
      keepChallengeId: "on-plate",
      now: NOW,
    });
  });

  it("sweeps again on going live and on return from the background", async () => {
    const { rerender } = mount({ isLive: false });
    await act(flush);
    mockSweep.mockClear();

    await act(async () => {
      rerender(baseArgs({ isLive: true }));
      await flush();
    });
    expect(mockSweep).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateHandler?.("background");
      appStateHandler?.("active");
      await flush();
    });
    expect(mockSweep).toHaveBeenCalledTimes(2);
  });

  it("asks for a roster refresh only when something was actually withdrawn", async () => {
    const onStaleCancelled = jest.fn();
    reply([], [STALE()]);
    mount({ onStaleCancelled });
    await act(flush);
    expect(onStaleCancelled).not.toHaveBeenCalled();

    mockSweep.mockResolvedValue({ ok: true, data: { cancelled: [STALE()] } });
    await act(async () => {
      appStateHandler?.("background");
      appStateHandler?.("active");
      await flush();
    });
    expect(onStaleCancelled).toHaveBeenCalledTimes(1);
  });

  it("does not sweep on a failed read", async () => {
    mockGetPending.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "down" },
    });
    mount();
    await act(flush);

    expect(mockSweep).not.toHaveBeenCalled();
  });
});

describe("offers skipped by a match (jits-yiwx)", () => {
  it("re-offers a challenge whose offer was skipped because a match started", async () => {
    reply([pending()]);
    // The offer is still reading the challenger when a match starts, and the
    // hook then skips it.
    let finishOffer!: (outcome: string) => void;
    mockOffer.mockImplementationOnce(
      () => new Promise<string>((resolve) => (finishOffer = resolve)),
    );
    const { rerender } = mount();
    await act(flush);
    expect(mockOffer).toHaveBeenCalledTimes(1);
    await act(async () => {
      rerender(baseArgs({ inMatch: true }));
      finishOffer("retry");
      await flush();
    });

    mockOffer.mockResolvedValue("raised");
    await act(async () => {
      rerender(baseArgs({ inMatch: false }));
      await flush();
    });

    expect(mockOffer).toHaveBeenCalledTimes(2);
    expect(mockOffer).toHaveBeenLastCalledWith("ch-1", "rival-1", expect.objectContaining({ createdAt: expect.any(String) }));
  });

  it("does not keep re-offering one the hook refused for good (already answered)", async () => {
    reply([pending()]);
    mockOffer.mockResolvedValue("final");
    const { rerender } = mount();
    await act(flush);

    await act(async () => {
      rerender(baseArgs({ lobbyIds: new Set(["rival-1", "x"]) }));
      await flush();
    });

    expect(mockOffer).toHaveBeenCalledTimes(1);
  });

  it("reads again after a match and re-offers a prompt the match dropped", async () => {
    reply([pending()]);
    const { rerender } = mount();
    await act(flush);
    expect(mockOffer).toHaveBeenCalledTimes(1);

    // A deep link starts a match while the prompt is up; the challenge hook
    // drops the prompt (not settled).
    await act(async () => {
      rerender(baseArgs({ inMatch: true }));
      await flush();
    });
    mockGetPending.mockClear();

    await act(async () => {
      rerender(baseArgs({ inMatch: false }));
      await flush();
    });

    expect(mockGetPending).toHaveBeenCalledTimes(1);
    expect(mockOffer).toHaveBeenCalledTimes(2);
  });

  it("does not re-offer after the match once the challenge went stale", async () => {
    reply([pending()]);
    const { rerender } = mount();
    await act(flush);
    await act(async () => {
      rerender(baseArgs({ inMatch: true }));
      await flush();
    });

    (Date.now as jest.Mock).mockReturnValue(NOW + PENDING_PROMPT_MAX_AGE_MS);
    await act(async () => {
      rerender(baseArgs({ inMatch: false }));
      await flush();
    });

    expect(mockOffer).toHaveBeenCalledTimes(1);
  });
});

describe("re-reading on request (a prompt cleared, a channel rebuilt)", () => {
  it("offers the next challenger queued behind a declined prompt", async () => {
    // Three challengers, one target: B's INSERT landed while A's prompt was
    // up, so it was never shown. A is declined; the re-read offers B.
    const lobby = new Set(["rival-a", "rival-b"]);
    reply([pending({ challengeId: "ch-a", challengerId: "rival-a" })]);
    const { rerender } = mount({ lobbyIds: lobby });
    await act(flush);
    expect(mockOffer).toHaveBeenCalledWith("ch-a", "rival-a", expect.objectContaining({ createdAt: expect.any(String) }));

    // A's prompt is up, then declined.
    await act(async () => {
      rerender(baseArgs({ hasIncoming: true, lobbyIds: lobby }));
      await flush();
    });
    reply([pending({ challengeId: "ch-b", challengerId: "rival-b" })]);
    mockOffer.mockClear();
    mockGetPending.mockClear();
    await act(async () => {
      rerender(baseArgs({ hasIncoming: false, lobbyIds: lobby }));
      requestPendingChallengeResync();
      await flush();
    });

    expect(mockGetPending).toHaveBeenCalledTimes(1);
    expect(mockOffer).toHaveBeenCalledTimes(1);
    expect(mockOffer).toHaveBeenCalledWith("ch-b", "rival-b", expect.objectContaining({ createdAt: expect.any(String) }));
  });

  it("is ignored mid-match (the match exit reads anyway)", async () => {
    mount({ inMatch: true });
    await act(flush);
    mockGetPending.mockClear();

    await act(async () => {
      requestPendingChallengeResync();
      await flush();
    });
    expect(mockGetPending).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", async () => {
    const { unmount } = mount();
    await act(flush);
    unmount();
    mockGetPending.mockClear();

    requestPendingChallengeResync();
    await flush();
    expect(mockGetPending).not.toHaveBeenCalled();
  });
});

describe("a retryable skip stays eligible (review item 3)", () => {
  it("offers again on the next resync after a 'retry' (another prompt was up)", async () => {
    reply([pending()]);
    mockOffer.mockResolvedValueOnce("retry");
    mount();
    await act(flush);
    expect(mockOffer).toHaveBeenCalledTimes(1);

    mockOffer.mockResolvedValue("raised");
    await act(async () => {
      requestPendingChallengeResync();
      await flush();
    });
    expect(mockOffer).toHaveBeenCalledTimes(2);
    expect(mockOffer).toHaveBeenLastCalledWith("ch-1", "rival-1", expect.objectContaining({ createdAt: expect.any(String) }));
  });

  it("offers again after a resync that names it for re-offer (its challenger came back)", async () => {
    // Raised once, then cleared because the challenger stepped off the mat.
    reply([pending()]);
    const { rerender } = mount({ lobbyIds: new Set(["rival-1"]) });
    await act(flush);
    expect(mockOffer).toHaveBeenCalledTimes(1);

    // A plain resync never re-offers one that was raised.
    await act(async () => {
      rerender(baseArgs({ lobbyIds: new Set(["rival-1", "x"]) }));
      requestPendingChallengeResync();
      await flush();
    });
    expect(mockOffer).toHaveBeenCalledTimes(1);

    // Named for re-offer: gone from the lobby, so not yet...
    await act(async () => {
      rerender(baseArgs({ lobbyIds: new Set(["x"]) }));
      requestPendingChallengeResync({ reoffer: "ch-1" });
      await flush();
    });
    expect(mockOffer).toHaveBeenCalledTimes(1);
    // ...and offered once the challenger is back on the mat.
    await act(async () => {
      rerender(baseArgs({ lobbyIds: new Set(["x", "rival-1"]) }));
      await flush();
    });
    expect(mockOffer).toHaveBeenCalledTimes(2);
    expect(mockOffer).toHaveBeenLastCalledWith("ch-1", "rival-1", expect.anything());
  });

  it("never offers again after 'final', even on a resync", async () => {
    reply([pending()]);
    mockOffer.mockResolvedValue("final");
    mount();
    await act(flush);
    await act(async () => {
      requestPendingChallengeResync();
      await flush();
    });
    expect(mockOffer).toHaveBeenCalledTimes(1);
  });
});

describe("feeding the incoming count (F9)", () => {
  it("hands every fresh incoming challenge to onIncomingRead, whatever the lobby, with the read's start time", async () => {
    const onIncomingRead = jest.fn();
    reply([
      pending({ challengeId: "ch-1", challengerId: "rival-1" }),
      pending({ challengeId: "ch-2", challengerId: "gone-2" }),
      pending({
        challengeId: "ch-old",
        createdAt: new Date(NOW - PENDING_PROMPT_MAX_AGE_MS - 1).toISOString(),
      }),
    ]);
    mount({ isLive: false, onIncomingRead });
    await act(flush);

    expect(onIncomingRead).toHaveBeenCalledTimes(1);
    const [fresh, startedAt] = onIncomingRead.mock.calls[0];
    expect(fresh.map((c: { challengeId: string }) => c.challengeId)).toEqual(["ch-1", "ch-2"]);
    expect(startedAt).toBe(NOW);
  });

  it("does not call onIncomingRead for a failed read", async () => {
    const onIncomingRead = jest.fn();
    mockGetPending.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    mount({ onIncomingRead });
    await act(flush);
    expect(onIncomingRead).not.toHaveBeenCalled();
  });

  it("offers with the row's timestamps so the prompt can count down", async () => {
    reply([pending()]);
    mount();
    await act(flush);
    expect(mockOffer).toHaveBeenCalledWith("ch-1", "rival-1", {
      createdAt: new Date(NOW - 60_000).toISOString(),
      expiresAt: new Date(NOW + 7 * 86_400_000).toISOString(),
    });
  });
});

describe("a challenge opened from its push (prefer, AC-A8)", () => {
  const lobby = new Set(["rival-new", "rival-old"]);
  // Distinct ages, so the default order (OLDEST first, spec 4.3) is known:
  // without a preference, recovery offers ch-old. The tests prefer ch-new,
  // the one the default order would NOT pick.
  const both = () =>
    reply([
      pending({
        challengeId: "ch-new",
        challengerId: "rival-new",
        createdAt: new Date(NOW - 60_000).toISOString(),
      }),
      pending({
        challengeId: "ch-old",
        challengerId: "rival-old",
        createdAt: new Date(NOW - 5 * 60_000).toISOString(),
      }),
    ]);

  it("without a preference, offers the oldest first (the baseline the tests below beat)", async () => {
    both();
    mount({ lobbyIds: lobby });
    await act(flush);
    expect(mockOffer.mock.calls[0][0]).toBe("ch-old");
  });

  it("offers the preferred challenge ahead of the oldest one", async () => {
    both();
    // Offline at first: the push landed on an offline Arena.
    const { rerender } = mount({ isLive: false, lobbyIds: lobby });
    await act(flush);
    await act(async () => {
      requestPendingChallengeResync({ prefer: "ch-new" });
      await flush();
    });
    expect(mockOffer).not.toHaveBeenCalled();

    // Going live raises the preferred one first, not the oldest. (This
    // harness never reports the raised prompt back through `hasIncoming`,
    // so the oldest follows it; in the app the raised prompt blocks it.)
    await act(async () => {
      rerender(baseArgs({ isLive: true, lobbyIds: lobby }));
      await flush();
    });
    expect(mockOffer.mock.calls[0][0]).toBe("ch-new");
  });

  it("keeps the preference through a retryable skip", async () => {
    both();
    // The first offer is skipped for now (another prompt raced up, or a
    // match is starting): the preference must survive it.
    mockOffer.mockResolvedValueOnce("retry");
    const { rerender } = mount({ isLive: false, lobbyIds: lobby });
    await act(flush);
    await act(async () => {
      requestPendingChallengeResync({ prefer: "ch-new" });
      await flush();
    });
    await act(async () => {
      rerender(baseArgs({ isLive: true, lobbyIds: lobby }));
      await flush();
    });
    // Going live reads again, so a second pass follows the skipped one: it
    // offers the preferred challenge again, never the oldest in between.
    // (With the preference dropped at the skip, that pass offered ch-old.)
    expect(mockOffer.mock.calls.map((c) => c[0])).toEqual(["ch-new", "ch-new"]);
  });

  it("makes a preferred challenge that was offered before eligible again", async () => {
    reply([pending({ challengeId: "ch-old", challengerId: "rival-old" })]);
    const { rerender } = mount({ lobbyIds: lobby });
    await act(flush);
    expect(mockOffer).toHaveBeenCalledTimes(1);
    // The prompt was cleared without an answer; the push opens it again.
    await act(async () => {
      rerender(baseArgs({ lobbyIds: new Set(["rival-old", "x"]) }));
      requestPendingChallengeResync({ prefer: "ch-old" });
      await flush();
    });
    expect(mockOffer).toHaveBeenCalledTimes(2);
    expect(mockOffer).toHaveBeenLastCalledWith("ch-old", "rival-old", expect.anything());
  });

  it("falls back to the oldest when the preferred one's challenger is off the mat", async () => {
    both();
    const { rerender } = mount({ isLive: false, lobbyIds: new Set(["rival-old"]) });
    await act(flush);
    await act(async () => {
      requestPendingChallengeResync({ prefer: "ch-new" });
      await flush();
    });
    await act(async () => {
      rerender(baseArgs({ isLive: true, lobbyIds: new Set(["rival-old"]) }));
      await flush();
    });
    expect(mockOffer).toHaveBeenCalledTimes(1);
    expect(mockOffer).toHaveBeenCalledWith("ch-old", "rival-old", expect.anything());
  });

  it("never offers the preferred one over a prompt that is up", async () => {
    both();
    mount({ hasIncoming: true, lobbyIds: lobby });
    await act(flush);
    await act(async () => {
      requestPendingChallengeResync({ prefer: "ch-new" });
      await flush();
    });
    expect(mockOffer).not.toHaveBeenCalled();
  });

  it("live, another challenge tucked with Later: the pushed one takes its place", async () => {
    both();
    // ch-old was raised earlier and tucked away; the push is for ch-new.
    const { rerender } = mount({
      lobbyIds: lobby,
      hasIncoming: true,
      tuckedIncomingId: "ch-old",
    });
    await act(flush);
    expect(mockOffer).not.toHaveBeenCalled();
    await act(async () => {
      requestPendingChallengeResync({ prefer: "ch-new" });
      await flush();
    });
    expect(mockOffer).toHaveBeenCalledTimes(1);
    expect(mockOffer).toHaveBeenCalledWith("ch-new", "rival-new", expect.anything(), {
      replaceTucked: true,
    });

    // Once raised, the preference is spent: a tucked prompt yields to
    // nothing else (the oldest-first fallback never replaces it).
    await act(async () => {
      rerender(baseArgs({ lobbyIds: new Set(["rival-old", "rival-new", "x"]), hasIncoming: true, tuckedIncomingId: "ch-old" }));
      await flush();
    });
    expect(mockOffer).toHaveBeenCalledTimes(1);
  });

  it("a tucked prompt yields only to the pushed challenge, never to the oldest fallback", async () => {
    both();
    // The pushed challenge's challenger is off the mat: nothing replaces the tuck.
    mount({ lobbyIds: new Set(["rival-old"]), hasIncoming: true, tuckedIncomingId: "ch-x" });
    await act(async () => {
      requestPendingChallengeResync({ prefer: "ch-new" });
      await flush();
    });
    expect(mockOffer).not.toHaveBeenCalled();
  });

  it("the pushed challenge that is itself the tucked one is left to the deep link (reopen)", async () => {
    both();
    mount({ lobbyIds: lobby, hasIncoming: true, tuckedIncomingId: "ch-new" });
    await act(async () => {
      requestPendingChallengeResync({ prefer: "ch-new" });
      await flush();
    });
    expect(mockOffer).not.toHaveBeenCalled();
  });

  it("a read after the push that no longer lists the preferred challenge ends the preference", async () => {
    // ch-old is tucked; the push is for ch-new, which is already gone.
    reply([pending({ challengeId: "ch-old", challengerId: "rival-old" })]);
    mount({ lobbyIds: lobby, hasIncoming: true, tuckedIncomingId: "ch-old" });
    await act(flush);
    await act(async () => {
      requestPendingChallengeResync({ prefer: "ch-new" });
      await flush();
    });
    expect(mockOffer).not.toHaveBeenCalled();
    // Were the preference still armed, a later read listing ch-new would
    // replace the tucked prompt with it.
    both();
    await act(async () => {
      requestPendingChallengeResync();
      await flush();
    });
    expect(mockOffer).not.toHaveBeenCalled();
  });

  it("the preferred challenge ending (cancelled, answered elsewhere) ends the preference", async () => {
    both();
    // ch-new's challenger is off the mat, so it waits; ch-old is tucked.
    const { rerender } = mount({
      lobbyIds: new Set(["rival-old"]),
      hasIncoming: true,
      tuckedIncomingId: "ch-old",
    });
    await act(async () => {
      requestPendingChallengeResync({ prefer: "ch-new" });
      await flush();
    });
    expect(mockOffer).not.toHaveBeenCalled();
    act(() => notifyIncomingChallengeEnded("ch-new"));
    // Its challenger comes back: nothing replaces the tucked prompt.
    await act(async () => {
      rerender(
        baseArgs({ lobbyIds: lobby, hasIncoming: true, tuckedIncomingId: "ch-old" }),
      );
      await flush();
    });
    expect(mockOffer).not.toHaveBeenCalled();
  });

  it("never offers the preferred one while offline", async () => {
    both();
    mount({ isLive: false, lobbyIds: lobby });
    await act(flush);
    await act(async () => {
      requestPendingChallengeResync({ prefer: "ch-new" });
      await flush();
    });
    expect(mockOffer).not.toHaveBeenCalled();
  });
});

describe("keepsPreference", () => {
  const pref = { id: "ch-1", setAt: NOW };
  it("keeps a preference the read still lists", () => {
    expect(keepsPreference(pref, [pending() as never], NOW)).toBe(true);
  });
  it("ends one a later read no longer lists", () => {
    expect(keepsPreference(pref, [], NOW)).toBe(false);
    expect(keepsPreference(pref, [pending({ challengeId: "ch-2" }) as never], NOW + 1)).toBe(false);
  });
  it("a read issued before the preference proves nothing and keeps it", () => {
    expect(keepsPreference(pref, [], NOW - 1)).toBe(true);
  });
  it("no preference, nothing to keep", () => {
    expect(keepsPreference(null, [pending() as never], NOW)).toBe(false);
  });
});
