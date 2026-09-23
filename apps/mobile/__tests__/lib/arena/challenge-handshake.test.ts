/**
 * The handshake both challenge surfaces share.
 *
 * This module exists because accepting is NOT a status write, and the one step
 * a second implementation silently drops is the broadcast. These tests pin the
 * ORDER (accept -> start -> broadcast) and pin that the broadcast is addressed
 * to the per-challenge topic the challenger is listening on, because getting
 * either wrong strands the challenger with no visible symptom on this side.
 *
 * Failure is always driven from RETURNED DATA, never a rejection: the shared
 * mutations return `Result` and never throw, and `channel.send()` resolves to
 * "ok" / "error" / "timed out". A mockRejectedValue here would certify a path
 * production cannot produce.
 */
import { challengeTopic } from "@/lib/arena/constants";

const mockCalls: string[] = [];
const mockChannelTopics: string[] = [];
const mockSend = jest.fn();
const mockRemoveChannel = jest.fn();

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: (topic: string) => {
      mockChannelTopics.push(topic);
      const channel = {
        topic,
        send(msg: { event: string }) {
          mockCalls.push(`send:${msg.event}`);
          return mockSend(msg);
        },
      };
      return channel;
    },
    removeChannel: (...a: unknown[]) => mockRemoveChannel(...a),
  },
}));

const mockAcceptChallenge = jest.fn();
const mockDeclineChallenge = jest.fn();
const mockStartMatch = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  acceptChallenge: (...a: unknown[]) => {
    mockCalls.push("accept");
    return mockAcceptChallenge(...a);
  },
  declineChallenge: (...a: unknown[]) => {
    mockCalls.push("decline");
    return mockDeclineChallenge(...a);
  },
  startMatchFromChallenge: (...a: unknown[]) => {
    mockCalls.push("start");
    return mockStartMatch(...a);
  },
}));

import {
  acceptChallengeAndStart,
  broadcastChallengeEvent,
  declineChallengeAndNotify,
} from "@/lib/arena/challenge-handshake";

const CHALLENGE = "ch-1";
const MATCH = "match-1";

beforeEach(() => {
  mockCalls.length = 0;
  mockChannelTopics.length = 0;
  jest.clearAllMocks();
  mockSend.mockResolvedValue("ok");
  mockAcceptChallenge.mockResolvedValue({ ok: true, data: undefined });
  mockDeclineChallenge.mockResolvedValue({ ok: true, data: undefined });
  mockStartMatch.mockResolvedValue({
    ok: true,
    data: { success: true, match_id: MATCH, challenge_id: CHALLENGE },
  });
});

describe("acceptChallengeAndStart", () => {
  it("accepts, starts, THEN broadcasts, and returns the match", async () => {
    const result = await acceptChallengeAndStart(CHALLENGE, 180);

    expect(result).toEqual({ ok: true, matchId: MATCH });
    // The whole contract of the module in one assertion. The broadcast has to
    // be the LAST thing before the caller navigates; a caller that navigated
    // first would leave the challenger on the waiting plate.
    expect(mockCalls).toEqual(["accept", "start", "send:match_started"]);
  });

  it("addresses the broadcast to the topic the challenger is listening on", async () => {
    await acceptChallengeAndStart(CHALLENGE, 180);

    expect(mockChannelTopics).toContain(challengeTopic(CHALLENGE));
    expect(mockSend).toHaveBeenCalledWith({
      type: "broadcast",
      event: "match_started",
      payload: { matchId: MATCH },
    });
  });

  it("passes the weight through, and drops a null rather than writing it", async () => {
    await acceptChallengeAndStart(CHALLENGE, null);

    expect(mockAcceptChallenge).toHaveBeenCalledWith(expect.anything(), {
      challengeId: CHALLENGE,
      opponentWeight: undefined,
    });
  });

  it("retries a broadcast that did not report ok", async () => {
    // send() resolves "error" rather than rejecting, so a .catch() here would
    // never fire and the challenger would be stranded.
    mockSend.mockResolvedValueOnce("error").mockResolvedValueOnce("ok");

    const result = await acceptChallengeAndStart(CHALLENGE, 180);

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, matchId: MATCH });
  });

  it("still reports the match when both broadcast attempts failed", async () => {
    // The match genuinely exists; refusing to navigate would strand BOTH
    // parties instead of one. The challenger's own status-change subscription
    // is the second witness.
    mockSend.mockResolvedValue("timed out");

    const result = await acceptChallengeAndStart(CHALLENGE, 180);

    expect(result).toEqual({ ok: true, matchId: MATCH });
  });

  it("never broadcasts when the accept write refused", async () => {
    mockAcceptChallenge.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "network is down" },
    });

    const result = await acceptChallengeAndStart(CHALLENGE, 180);

    expect(result).toEqual({ ok: false, message: "network is down" });
    expect(mockStartMatch).not.toHaveBeenCalled();
    expect(mockCalls).toEqual(["accept"]);
  });

  it("says a dead challenge is dead instead of blaming the match start", async () => {
    // acceptChallenge filters on status = 'pending' and a PostgREST update
    // matching no rows is NOT an error, so a cancelled or expired challenge
    // still returns ok. The truth arrives from start_match_from_challenge.
    mockStartMatch.mockResolvedValue({
      ok: false,
      error: {
        code: "CHALLENGE_NOT_ACCEPTED",
        message: "Challenge has not been accepted yet.",
      },
    });

    const result = await acceptChallengeAndStart(CHALLENGE, 180);

    expect(result).toEqual({
      ok: false,
      message: "That challenge is no longer available.",
    });
    expect(mockCalls).toEqual(["accept", "start"]);
  });
});

describe("declineChallengeAndNotify", () => {
  it("declines and tells the challenger", async () => {
    const told = await declineChallengeAndNotify(CHALLENGE);

    expect(told).toBe(true);
    expect(mockCalls).toEqual(["decline", "send:declined"]);
    expect(mockChannelTopics).toContain(challengeTopic(CHALLENGE));
  });

  it("reports failure and stays silent when the write refused", async () => {
    // The challenge is still pending server-side; broadcasting a decline that
    // did not happen would lie to the challenger.
    mockDeclineChallenge.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "nope" },
    });

    const told = await declineChallengeAndNotify(CHALLENGE);

    expect(told).toBe(false);
    expect(mockCalls).toEqual(["decline"]);
  });
});

describe("broadcastChallengeEvent", () => {
  it("cleans up the channel it opened", async () => {
    await broadcastChallengeEvent(CHALLENGE, "declined");
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });
});
