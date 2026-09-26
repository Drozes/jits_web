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
  requestPendingChallengeResync,
  usePendingChallengeRecovery,
  type UsePendingChallengeRecoveryArgs,
} from "@/lib/arena/use-pending-challenge-recovery";

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
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  mockOffer.mockResolvedValue(true);
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
  it("offers the newest fresh challenge whose challenger is in the lobby", async () => {
    reply([
      pending({ challengeId: "ch-new", challengerId: "gone-1" }),
      pending({ challengeId: "ch-1", challengerId: "rival-1" }),
    ]);
    mount();
    await act(flush);

    // The newer one's challenger has left, so it is not a live prompt.
    expect(mockOffer).toHaveBeenCalledTimes(1);
    expect(mockOffer).toHaveBeenCalledWith("ch-1", "rival-1");
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

    expect(mockOffer).toHaveBeenCalledWith("ch-1", "rival-1");
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
    let finishOffer!: (raised: boolean) => void;
    mockOffer.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finishOffer = resolve)),
    );
    const { rerender } = mount();
    await act(flush);
    expect(mockOffer).toHaveBeenCalledTimes(1);
    await act(async () => {
      rerender(baseArgs({ inMatch: true }));
      finishOffer(false);
      await flush();
    });

    mockOffer.mockResolvedValue(true);
    await act(async () => {
      rerender(baseArgs({ inMatch: false }));
      await flush();
    });

    expect(mockOffer).toHaveBeenCalledTimes(2);
    expect(mockOffer).toHaveBeenLastCalledWith("ch-1", "rival-1");
  });

  it("does not keep re-offering one the hook refused for good (already answered)", async () => {
    reply([pending()]);
    mockOffer.mockResolvedValue(false);
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
    expect(mockOffer).toHaveBeenCalledWith("ch-a", "rival-a");

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
    expect(mockOffer).toHaveBeenCalledWith("ch-b", "rival-b");
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
