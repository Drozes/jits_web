/**
 * The `?challenge=<id>` handoff at hook level (AC-A8): which reads become an
 * offer, and that an offer never outlives its challenge.
 *
 * Source: apps/mobile/lib/arena/use-challenge-deep-link.ts
 */
import { act, renderHook } from "@testing-library/react-native";

const ID = "11111111-1111-4111-8111-111111111111";
let mockParams: Record<string, string | undefined> = {};
const mockSetParams = jest.fn((p: Record<string, string | undefined>) => {
  mockParams = { ...mockParams, ...p };
});
// Stable, like the real navigation object.
const mockNavigation = { setParams: (p: Record<string, string | undefined>) => mockSetParams(p) };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
}));
const mockGetPending = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getPendingChallengesForAthlete: (...a: unknown[]) => mockGetPending(...a),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/arena/go-live-feedback", () => ({ goLiveWithFeedback: jest.fn() }));
const mockReopen = jest.fn();
const mockIsDismissed = jest.fn((_id: string) => false);
jest.mock("@/lib/arena/arena-store", () => ({
  ...jest.requireActual("@/lib/arena/arena-store"),
  arenaActions: {
    ...jest.requireActual("@/lib/arena/arena-store").arenaActions,
    reopenIncoming: () => mockReopen(),
  },
  isIncomingChallengeDismissed: (id: string) => mockIsDismissed(id),
}));
const mockResync = jest.fn();
jest.mock("@/lib/arena/use-pending-challenge-recovery", () => ({
  ...jest.requireActual("@/lib/arena/use-pending-challenge-recovery"),
  requestPendingChallengeResync: (...a: unknown[]) => mockResync(...a),
}));

import { useChallengeDeepLink, type ChallengeDeepLinkInput } from "@/lib/arena/use-challenge-deep-link";
import { __resetArenaStoreForTests, notifyIncomingChallengeEnded } from "@/lib/arena/arena-store";
import { __resetServerClockForTests } from "@/lib/arena/incoming-challenges";

const NOW = Date.parse("2026-09-25T12:00:00Z");

function hit(over: Record<string, unknown> = {}) {
  return {
    challengeId: ID,
    challengerId: "rival-1",
    challengerName: "Rival",
    createdAt: new Date(NOW - 60_000).toISOString(),
    expiresAt: new Date(NOW + 7 * 86_400_000).toISOString(),
    ...over,
  };
}

function reply(incoming: unknown[]) {
  mockGetPending.mockResolvedValue({ ok: true, data: { incoming, outgoing: [] } });
}

function args(over: Partial<ChallengeDeepLinkInput> = {}): ChallengeDeepLinkInput {
  return {
    athleteId: "me-1",
    isLive: false,
    incoming: null,
    incomingTucked: false,
    lobbyIds: new Set(["rival-1"]),
    ...over,
  };
}

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockParams = { challenge: ID };
  mockSetParams.mockReset();
  mockGetPending.mockReset();
  mockResync.mockReset();
  mockReopen.mockReset();
  mockIsDismissed.mockReset();
  mockIsDismissed.mockImplementation(() => false);
  __resetArenaStoreForTests();
  __resetServerClockForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

async function mount(over: Partial<ChallengeDeepLinkInput> = {}) {
  const r = renderHook((p: ChallengeDeepLinkInput) => useChallengeDeepLink(p), {
    initialProps: args(over),
  });
  await act(flush);
  return r;
}

describe("useChallengeDeepLink", () => {
  it("clears the param at once and offers a fresh challenge while offline", async () => {
    reply([hit()]);
    const { result } = await mount();
    expect(mockSetParams).toHaveBeenCalledWith({ challenge: undefined });
    expect(mockResync).toHaveBeenCalledWith({ prefer: ID });
    expect(result.current.offer?.challengeId).toBe(ID);
  });

  it.each([
    ["an unparsable createdAt", { createdAt: "not a date" }],
    ["an unparsable expiresAt", { expiresAt: "garbage" }],
  ])("never shows an offer for %s (no timer could ever clear it)", async (_label, over) => {
    reply([hit(over)]);
    const { result } = await mount();
    expect(result.current.offer).toBeNull();
    expect(mockResync).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(24 * 60 * 60_000);
    });
    expect(result.current.offer).toBeNull();
  });

  it("the offer clears itself when its 10-minute window passes", async () => {
    reply([hit()]);
    const { result } = await mount();
    expect(result.current.offer).not.toBeNull();
    act(() => {
      jest.advanceTimersByTime(10 * 60_000);
    });
    expect(result.current.offer).toBeNull();
  });

  it("the offer clears when the challenge ends", async () => {
    reply([hit()]);
    const { result } = await mount();
    act(() => notifyIncomingChallengeEnded(ID));
    expect(result.current.offer).toBeNull();
  });

  it("hides the offer while its challenger is off the mat", async () => {
    reply([hit()]);
    const { result } = await mount({ lobbyIds: new Set() });
    expect(result.current.offer).toBeNull();
  });

  it("hides the offer during a lobby outage (stale ids) and shows it once a sync vouches again", async () => {
    reply([hit()]);
    const { result, rerender } = await mount({ lobbyIds: new Set(["rival-1"]), lobbyKnown: false });
    expect(result.current.offer).toBeNull();
    await act(async () => {
      rerender(args({ lobbyIds: new Set(["rival-1"]), lobbyKnown: true }));
      await flush();
    });
    expect(result.current.offer?.challengeId).toBe(ID);
  });

  it("live: asks recovery to prefer the challenge and shows no offer", async () => {
    reply([hit()]);
    const { result } = await mount({ isLive: true });
    expect(mockResync).toHaveBeenCalledWith({ prefer: ID });
    expect(result.current.offer).toBeNull();
  });

  it("the challenge already tucked on the prompt is reopened without a read", async () => {
    reply([hit()]);
    const tucked = {
      challengeId: ID,
      challengerId: "rival-1",
      challengerName: "Rival",
      challengerElo: 1300,
      challengerWeight: null,
      createdAt: null,
      expiresAt: null,
    };
    const { result } = await mount({ isLive: true, incoming: tucked, incomingTucked: true });
    expect(mockReopen).toHaveBeenCalledTimes(1);
    expect(mockGetPending).not.toHaveBeenCalled();
    expect(mockResync).not.toHaveBeenCalled();
    expect(result.current.offer).toBeNull();
  });

  it("the offer clears once the athlete is live", async () => {
    reply([hit()]);
    const { result, rerender } = await mount();
    expect(result.current.offer?.challengeId).toBe(ID);
    rerender(args({ isLive: true }));
    expect(result.current.offer).toBeNull();
    // And stays gone if they go offline again.
    rerender(args({ isLive: false }));
    expect(result.current.offer).toBeNull();
  });

  it("a challenge dismissed on this device (tucked, then a manual go-offline, Q3) is never offered", async () => {
    reply([hit()]);
    mockIsDismissed.mockImplementation((id) => id === ID);
    const { result } = await mount();
    expect(mockGetPending).toHaveBeenCalledTimes(1);
    expect(mockResync).not.toHaveBeenCalled();
    expect(result.current.offer).toBeNull();
  });

  it("ignores a param that is not a uuid", async () => {
    mockParams = { challenge: "nope" };
    reply([hit()]);
    const { result } = await mount();
    expect(mockGetPending).not.toHaveBeenCalled();
    expect(result.current.offer).toBeNull();
  });

  describe("seeded from the bell's fresh count (no param)", () => {
    const ID2 = "22222222-2222-4222-8222-222222222222";

    it("offers the OLDEST fresh on-mat challenge while offline", async () => {
      mockParams = {};
      reply([
        hit({ challengeId: ID2, challengerId: "rival-2", createdAt: new Date(NOW - 30_000).toISOString() }),
        hit({ createdAt: new Date(NOW - 120_000).toISOString() }),
      ]);
      const { result } = await mount({
        freshIncomingCount: 2,
        lobbyIds: new Set(["rival-1", "rival-2"]),
      });
      expect(result.current.offer?.challengeId).toBe(ID);
      // Not asked up front: only the go-live tap prefers it.
      expect(mockResync).not.toHaveBeenCalled();
      act(() => result.current.acceptOffer());
      expect(mockResync).toHaveBeenCalledWith({ prefer: ID });
    });

    it("skips an off-mat challenger for the next on-mat one, and each drops at its window", async () => {
      mockParams = {};
      reply([
        hit({ createdAt: new Date(NOW - 120_000).toISOString() }),
        hit({ challengeId: ID2, challengerId: "rival-2", createdAt: new Date(NOW - 30_000).toISOString() }),
      ]);
      const { result } = await mount({ freshIncomingCount: 2, lobbyIds: new Set(["rival-2"]) });
      expect(result.current.offer?.challengeId).toBe(ID2);
      act(() => {
        jest.advanceTimersByTime(10 * 60_000);
      });
      expect(result.current.offer).toBeNull();
    });

    it("drops a seeded offer when its challenge ends, and never seeds while live", async () => {
      mockParams = {};
      reply([hit()]);
      const { result, rerender } = await mount({ freshIncomingCount: 1 });
      expect(result.current.offer?.challengeId).toBe(ID);
      act(() => notifyIncomingChallengeEnded(ID));
      expect(result.current.offer).toBeNull();

      reply([hit({ challengeId: ID2, challengerId: "rival-2" })]);
      await act(async () => {
        rerender(args({ isLive: true, freshIncomingCount: 2, lobbyIds: new Set(["rival-2"]) }));
        await flush();
      });
      expect(result.current.offer).toBeNull();
      // On the mat while live: recovery raises it, so it is not "away".
      expect(result.current.away).toEqual([]);
      expect(result.current.moreOnMat).toBe(0);
    });

    it("a seeded offer never outranks a prompt in hand; it counts on that strip's +N", async () => {
      mockParams = {};
      reply([hit(), hit({ challengeId: ID2, challengerId: "rival-2" })]);
      const tucked = await mount({
        freshIncomingCount: 2,
        incoming: { challengeId: ID } as never,
        incomingTucked: true,
        lobbyIds: new Set(["rival-1", "rival-2"]),
      });
      expect(tucked.result.current.offer).toBeNull();
      expect(tucked.result.current.moreOnMat).toBe(1);
      expect(tucked.result.current.away).toEqual([]);
    });

    describe("away: fresh challenges from challengers off the mat (spec 14)", () => {
      it("offline: lists them, oldest first, so the red tab count has a strip behind it", async () => {
        mockParams = {};
        reply([
          hit({ challengeId: ID2, challengerId: "rival-2", createdAt: new Date(NOW - 30_000).toISOString() }),
          hit({ createdAt: new Date(NOW - 120_000).toISOString() }),
        ]);
        const { result } = await mount({ freshIncomingCount: 2, lobbyIds: new Set() });
        expect(result.current.offer).toBeNull();
        expect(result.current.away.map((c) => c.challengeId)).toEqual([ID, ID2]);
        expect(result.current.moreOnMat).toBe(0);
      });

      it("live: a second challenger off the mat is away while the first is on the prompt", async () => {
        mockParams = {};
        reply([hit(), hit({ challengeId: ID2, challengerId: "rival-2" })]);
        const { result } = await mount({
          isLive: true,
          freshIncomingCount: 2,
          incoming: { challengeId: ID } as never,
          lobbyIds: new Set(["rival-1"]),
        });
        expect(result.current.away.map((c) => c.challengeId)).toEqual([ID2]);
      });

      it("a deep-linked offer whose challenger left is away, and moves back when they return", async () => {
        reply([hit()]);
        const { result, rerender } = await mount({ freshIncomingCount: 1, lobbyIds: new Set() });
        expect(result.current.offer).toBeNull();
        expect(result.current.away.map((c) => c.challengeId)).toEqual([ID]);
        rerender(args({ freshIncomingCount: 1, lobbyIds: new Set(["rival-1"]) }));
        expect(result.current.offer?.challengeId).toBe(ID);
        expect(result.current.away).toEqual([]);
      });

      it("is empty during a lobby outage, and leaves out dismissed and ended challenges", async () => {
        mockParams = {};
        reply([hit(), hit({ challengeId: ID2, challengerId: "rival-2" })]);
        const outage = await mount({ freshIncomingCount: 2, lobbyIds: new Set(), lobbyKnown: false });
        expect(outage.result.current.away).toEqual([]);

        mockIsDismissed.mockImplementation((id) => id === ID);
        const { result } = await mount({ freshIncomingCount: 2, lobbyIds: new Set() });
        expect(result.current.away.map((c) => c.challengeId)).toEqual([ID2]);
        act(() => notifyIncomingChallengeEnded(ID2));
        expect(result.current.away).toEqual([]);
      });

      it("drops each one at the end of its window", async () => {
        mockParams = {};
        reply([hit()]);
        const { result } = await mount({ freshIncomingCount: 1, lobbyIds: new Set() });
        expect(result.current.away).toHaveLength(1);
        act(() => {
          jest.advanceTimersByTime(10 * 60_000);
        });
        expect(result.current.away).toEqual([]);
      });
    });

    it("never seeds the challenge already in hand, nor a dismissed one", async () => {
      mockParams = {};
      reply([hit()]);
      const inHand = await mount({
        freshIncomingCount: 1,
        incoming: { challengeId: ID } as never,
        incomingTucked: true,
      });
      expect(inHand.result.current.offer).toBeNull();

      mockIsDismissed.mockImplementation((id) => id === ID);
      const dismissed = await mount({ freshIncomingCount: 1 });
      expect(dismissed.result.current.offer).toBeNull();
    });
  });
});
