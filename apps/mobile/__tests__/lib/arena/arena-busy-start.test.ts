/**
 * The timekeeper-mode busy refusal (R2, spec 3.4 and 11; slice M6) through
 * the REAL Arena handshake and the REAL chokepoint (`challenge-api.ts`):
 * only the data layer and the channels are stubbed, the same way
 * `use-arena-challenge.test.ts` stubs them.
 *
 * Accepting a challenge whose match INSERT is refused busy shows ONE toast,
 * the shipped title `Couldn't start match` over the deck's words for this
 * athlete (TK-E2 or TK-E3, COPY-DECK), asks the server to
 * start it once, withdraws the accepted challenge (so the challenger's 12 s
 * fallback has nothing to retry) and never navigates.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface Binding {
  type: string;
  filter: Record<string, string>;
  handler: (payload: unknown) => void | Promise<void>;
}
const mockBindings: Binding[] = [];
const mockRegistered: unknown[] = [];

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: (topic: string) => {
      const channel = {
        topic,
        on(type: string, filter: Record<string, string>, handler: Binding["handler"]) {
          mockBindings.push({ type, filter, handler });
          return channel;
        },
        subscribe() {
          return channel;
        },
        send: () => Promise.resolve("ok"),
      };
      mockRegistered.push(channel);
      return channel;
    },
    getChannels: () => [...mockRegistered],
    removeChannel: () => Promise.resolve("ok"),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { display_name: "Mina Park", current_elo: 1500, current_weight: 168 }, error: null }),
        }),
      }),
    }),
  },
}));

const mockAccept = jest.fn();
const mockCancel = jest.fn();
const mockStart = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  cancelStaleOutgoingChallenges: () => Promise.resolve({ ok: true, data: { cancelled: [] } }),
  declineOtherPendingChallenges: () => Promise.resolve({ ok: true, data: { declined: [], skipped: [] } }),
  createChallenge: jest.fn(),
  acceptChallenge: (...a: unknown[]) => mockAccept(...a),
  declineChallenge: () => Promise.resolve({ ok: true, data: undefined }),
  cancelChallenge: (...a: unknown[]) => mockCancel(...a),
  startMatchFromChallenge: (...a: unknown[]) => mockStart(...a),
}));

const mockBetween = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getChallengeStatus: () => Promise.resolve({ ok: true, data: { status: "pending", expiresAt: null } }),
  getStartedChallengesToJoin: () => Promise.resolve({ ok: true, data: [] }),
  getChallengesBetween: (...a: unknown[]) => mockBetween(...a),
}));

jest.mock("@/lib/arena/use-pending-challenge-recovery", () => ({
  requestPendingChallengeResync: jest.fn(),
}));

const mockPush = jest.fn();
const mockRouter = { push: mockPush, replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

jest.mock("@/lib/arena/arena-presence", () => ({
  ...jest.requireActual("@/lib/arena/arena-presence"),
  reportArenaReading: () => Promise.resolve(),
}));
jest.mock("@/lib/arena/match-location-flag", () => ({ markMatchLocationRequired: jest.fn() }));
jest.mock("@/lib/arena/location-flags", () => ({ markMatchProximityRequired: jest.fn() }));

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
import { __resetArenaStoreForTests, publishArenaSelfId } from "@/lib/arena/arena-store";
import { __resetChallengeApiForTests } from "@/lib/arena/challenge-api";
import { __resetServerClockForTests } from "@/lib/arena/incoming-challenges";

const ME = "me-1";
const RIVAL = "opp-1";
const CHALLENGE = "ch-1";

function busy(code: "TIMEKEEPER_BUSY" | "ATHLETE_IN_TIMEKEEPER_MATCH", busyId: string) {
  return {
    ok: false,
    error: {
      code,
      message: "Timekeeping another match",
      raw: { code: "P0001", message: "busy", details: busyId, hint: code.toLowerCase() },
    },
  };
}

async function acceptIncoming(flags: { locationRequired?: boolean; proximityRequired?: boolean } = {}) {
  const { result } = renderHook(() => useArenaChallenge({ athleteId: ME, athleteWeight: 170, ...flags }));
  const insert = mockBindings.find(
    (b) => b.type === "postgres_changes" && b.filter.event === "INSERT" && b.filter.filter === `opponent_id=eq.${ME}`,
  );
  if (!insert) throw new Error("no incoming binding");
  await act(async () => {
    await insert.handler({ new: { id: CHALLENGE, challenger_id: RIVAL, opponent_id: ME, status: "pending" } });
  });
  await waitFor(() => expect(result.current.incoming).not.toBeNull());
  await act(async () => {
    await result.current.accept();
  });
  return result;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetServerClockForTests();
  __resetArenaStoreForTests();
  __resetChallengeApiForTests();
  mockBindings.length = 0;
  mockRegistered.length = 0;
  jest.clearAllMocks();
  publishArenaSelfId(ME);
  mockAccept.mockResolvedValue({ ok: true, data: undefined });
  mockCancel.mockResolvedValue({ ok: true, data: { cancelled: true } });
  mockBetween.mockResolvedValue([
    {
      id: CHALLENGE,
      status: "accepted",
      challenger: { id: RIVAL, display_name: "Mina Park", current_elo: 1500, profile_photo_url: null },
      opponent: { id: ME, display_name: "Kai Reyes", current_elo: 1512, profile_photo_url: null },
    },
  ]);
});

describe("accepting into a busy refusal", () => {
  it("the challenger is busy: one TK-E3 toast, one server start, the challenge withdrawn, no navigation", async () => {
    mockStart.mockResolvedValue(busy("ATHLETE_IN_TIMEKEEPER_MATCH", RIVAL));
    const result = await acceptIncoming();

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledWith(expect.anything(), CHALLENGE, { onlyIfAccepted: true });
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledWith({
      text1: "Couldn't start match",
      description: "Mina Park is busy in another match.",
    });
    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(result.current.incoming).toBeNull();
  });

  it("I am the busy timekeeper: one TK-E2 toast", async () => {
    mockStart.mockResolvedValue(busy("TIMEKEEPER_BUSY", ME));
    await acceptIncoming();

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledWith({
      text1: "Couldn't start match",
      description: "You're timekeeping another match.",
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// match_proximity_required on: the proximity refusal comes before the match
// INSERT, so a start first refused for proximity can be refused busy on Retry.
describe("Retry after a proximity refusal, refused busy", () => {
  it("one busy toast, the sheet cleared (the challenge is withdrawn), no generic error, no navigation", async () => {
    mockStart
      .mockResolvedValueOnce({ ok: false, error: { code: "PROXIMITY_REQUIRED", message: "not on one mat" } })
      .mockResolvedValue(busy("ATHLETE_IN_TIMEKEEPER_MATCH", RIVAL));
    const result = await acceptIncoming({ locationRequired: true, proximityRequired: true });
    expect(result.current.startBlocked?.challengeId).toBe(CHALLENGE);
    // A proximity refusal never withdraws.
    expect(mockCancel).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.retryBlockedStart();
    });
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockCancel).toHaveBeenCalledWith(expect.anything(), CHALLENGE, { onlyIfAccepted: true });
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledWith({
      text1: "Couldn't start match",
      description: "Mina Park is busy in another match.",
    });
    expect(mockToastInfo).not.toHaveBeenCalled();
    // Nothing left to retry: the sheet is gone.
    expect(result.current.startBlocked).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
