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
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import {
  PENDING_PROMPT_MAX_AGE_MS,
  isFreshPending,
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
  mockOffer.mockResolvedValue(undefined);
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
