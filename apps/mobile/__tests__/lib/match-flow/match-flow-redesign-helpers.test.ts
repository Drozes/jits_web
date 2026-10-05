/**
 * Small pure pieces of the match-flow redesign: the recording opt-in store
 * (OFF on first use, remembered per device), the defensive read of the new
 * get_match_details fields, the dispute lock note, the rank strip copy, and
 * the live screen's "recording off" no-video state.
 */
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  RECORDING_OPTIN_KEY,
  __resetRecordingOptInForTests,
  getRecordingOptIn,
  hydrateRecordingOptIn,
  setRecordingOptIn,
} from "@/lib/match-flow/recording-optin";
import {
  LEAVE_COUNTS_AS_CONFIRMING,
  disputeLockNote,
  isDisputeWindowClosed,
  readMatchExtras,
  resolveDisputeLocksAt,
} from "@/lib/match-flow/match-extras";
import {
  POSTER_POLL_LIMIT,
  POSTER_POLL_MAX_MS,
  POSTER_POLL_MS,
  POSTER_POLL_WINDOW_MS,
  posterPollDelay,
  rankStripText,
} from "@/lib/match-flow/use-verdict-data";
import { deriveLiveView } from "@/lib/match-flow/live-view-state";
import { noVideoCopy } from "@/components/match-flow/live/no-video-plate";
import { formatSignedDelta, initialsOf, shortName } from "@/components/match-flow/fight/fight-ui";

describe("recording opt-in", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetRecordingOptInForTests(false, false);
  });

  it("is OFF on first use", async () => {
    await hydrateRecordingOptIn();
    expect(getRecordingOptIn()).toBe(false);
  });

  it("remembers the choice on this device", async () => {
    setRecordingOptIn(true);
    expect(await AsyncStorage.getItem(RECORDING_OPTIN_KEY)).toBe("1");
    __resetRecordingOptInForTests(false, false);
    await hydrateRecordingOptIn();
    expect(getRecordingOptIn()).toBe(true);
  });

  it("a choice made before the stored one loads wins", async () => {
    await AsyncStorage.setItem(RECORDING_OPTIN_KEY, "1");
    const pending = hydrateRecordingOptIn();
    setRecordingOptIn(false);
    await pending;
    expect(getRecordingOptIn()).toBe(false);
  });
});

describe("readMatchExtras", () => {
  it("reads the B3/B4 fields when present", () => {
    const m = {
      id: "M1",
      winner_id: "a",
      submission_name: "Armbar",
      finish_time_seconds: 90,
      dispute_locks_at: "2026-09-28T12:00:00Z",
      completed_at: "2026-09-27T12:00:00Z",
    } as never;
    expect(readMatchExtras(m)).toEqual({
      winnerId: "a",
      submissionName: "Armbar",
      finishTimeSeconds: 90,
      disputeLocksAt: "2026-09-28T12:00:00Z",
      completedAt: "2026-09-27T12:00:00Z",
    });
  });

  it("is all null on an older backend or junk", () => {
    expect(readMatchExtras({ id: "M1", finish_time_seconds: "90" } as never)).toEqual({
      winnerId: null,
      submissionName: null,
      finishTimeSeconds: null,
      disputeLocksAt: null,
      completedAt: null,
    });
    expect(readMatchExtras(null).disputeLocksAt).toBeNull();
  });
});

describe("dispute window", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  it("hours, then minutes, then nothing once passed", () => {
    expect(disputeLockNote("2026-09-28T12:00:00Z", now)).toBe("Locks automatically in 24 h.");
    expect(disputeLockNote("2026-09-27T12:20:00Z", now)).toBe("Locks automatically in 20 min.");
    expect(disputeLockNote("2026-09-27T11:00:00Z", now)).toBeNull();
    expect(disputeLockNote(null, now)).toBeNull();
  });
  it("the leave line says leaving counts as confirming (P-Confirm)", () => {
    expect(LEAVE_COUNTS_AS_CONFIRMING).toBe("If you leave without disputing, it counts as confirming.");
  });
  it("lock time: dispute_locks_at first, else completed_at + the backend lock window", () => {
    expect(resolveDisputeLocksAt("2026-09-28T12:00:00Z", "2026-09-27T00:00:00Z", 60)).toBe("2026-09-28T12:00:00Z");
    expect(resolveDisputeLocksAt(null, "2026-09-27T12:00:00Z", 86_400)).toBe("2026-09-28T12:00:00.000Z");
    expect(resolveDisputeLocksAt(null, "2026-09-27T12:00:00Z", null)).toBeNull();
    expect(resolveDisputeLocksAt(null, null, 86_400)).toBeNull();
    expect(resolveDisputeLocksAt(null, "not a date", 86_400)).toBeNull();
  });
  it("closed only once the lock time has passed", () => {
    expect(isDisputeWindowClosed("2026-09-27T11:59:59Z", now)).toBe(true);
    expect(isDisputeWindowClosed("2026-09-27T12:00:01Z", now)).toBe(false);
    expect(isDisputeWindowClosed(null, now)).toBe(false);
  });
});

describe("rankStripText", () => {
  const up = (over: Record<string, unknown> = {}) =>
    ({
      rank_before: 23,
      rank_after: 19,
      direction: "up",
      passed: [
        { athlete_id: "x", display_name: "Joao Silva" },
        { athlete_id: "y", display_name: "B C" },
        { athlete_id: "z", display_name: "D E" },
      ],
      passed_total: 5,
      ...over,
    }) as Parameters<typeof rankStripText>[0];
  it("a climb with who was passed, counting everyone (passed_total, not the 3 capped)", () => {
    expect(rankStripText(up(), shortName)).toBe("#23 \u2192 #19 \u00b7 PASSED J. SILVA +4");
    expect(rankStripText(up({ passed: [{ athlete_id: "x", display_name: "Joao Silva" }], passed_total: 1 }), shortName)).toBe(
      "#23 \u2192 #19 \u00b7 PASSED J. SILVA",
    );
    expect(rankStripText(up({ passed: [], passed_total: 0 }), shortName)).toBe("#23 \u2192 #19");
  });
  it("only for direction 'up'", () => {
    expect(rankStripText(up({ direction: "none" }), shortName)).toBeNull();
    expect(rankStripText(up({ direction: "down", rank_before: 19, rank_after: 23 }), shortName)).toBeNull();
    expect(rankStripText(up({ rank_before: null }), shortName)).toBeNull();
    expect(rankStripText(null, shortName)).toBeNull();
  });
});

describe("live screen: recording off", () => {
  it("is the no-video state, whatever the permission", () => {
    const v = deriveLiveView({
      remaining: 300,
      paused: false,
      holding: false,
      recorderState: "idle",
      permission: { granted: true, canAskAgain: true },
      opponentEnded: false,
      hasRecorded: false,
      recordingOff: true,
    });
    expect(v.camera).toBe("unavailable");
    expect(v.unavailable).toBe("off");
    expect(v.tally).toBe("noVideo");
    expect(v.strip).toBeNull();
  });
  it("says why, without a camera button", () => {
    expect(noVideoCopy("off", false)).toEqual({
      heading: "NOT RECORDING",
      body: "Recording is off on this phone. The clock runs as normal and your result still counts.",
    });
  });
});

describe("fight-night formatting", () => {
  it("signed deltas with the U+2212 minus", () => {
    expect(formatSignedDelta(14)).toBe("▲ +14");
    expect(formatSignedDelta(-9)).toBe("▼ −9");
    expect(formatSignedDelta(0)).toBe("0");
  });
  it("names", () => {
    expect(shortName("Mina Park")).toBe("M. Park");
    expect(shortName("Cher")).toBe("Cher");
    expect(shortName(" ")).toBe("Opponent");
    expect(initialsOf("Kai de la Reyes")).toBe("KR");
  });
});

describe("useMatchWeights", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderHook, waitFor } = require("@testing-library/react-native");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const weightsApi = require("@jits/shared/api/match-weights");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useMatchWeights } = require("@/lib/match-flow/use-match-weights");

  it("shows the profile weights until the challenge's rated ones are read, then those", async () => {
    const spy = jest.spyOn(weightsApi, "getMatchChallengeWeights").mockResolvedValue({
      challengerId: "opp",
      opponentId: "me",
      challengerWeight: 181,
      opponentWeight: 169,
    });
    const { result } = renderHook(() => useMatchWeights("c1", "me", 175, 180));
    expect(result.current).toEqual({ mine: 175, theirs: 180, rated: false });
    await waitFor(() => expect(result.current).toEqual({ mine: 169, theirs: 181, rated: true }));
    spy.mockRestore();
  });

  it("stays on the profile weights (unrated) when the challenge cannot be read", async () => {
    const spy = jest.spyOn(weightsApi, "getMatchChallengeWeights").mockResolvedValue(null);
    const { result } = renderHook(() => useMatchWeights("c1", "me", 175, 180));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toEqual({ mine: 175, theirs: 180, rated: false });
    spy.mockRestore();
  });
});

describe("posterPollDelay (jits-n2im.4 item 7)", () => {
  it("polls every 20 s for the first two minutes, then backs off to a cap", () => {
    const delays = Array.from({ length: 12 }, (_, n) => posterPollDelay(n));
    expect(delays.slice(0, POSTER_POLL_LIMIT)).toEqual(Array(POSTER_POLL_LIMIT).fill(POSTER_POLL_MS));
    for (let i = POSTER_POLL_LIMIT; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
      expect(delays[i]).toBeLessThanOrEqual(POSTER_POLL_MAX_MS);
    }
    expect(posterPollDelay(50)).toBe(POSTER_POLL_MAX_MS);
  });

  it("keeps polling well past the old two-minute stop, within the window", () => {
    let total = 0;
    let polls = 0;
    while (total < POSTER_POLL_WINDOW_MS) {
      total += posterPollDelay(polls);
      polls += 1;
    }
    expect(polls).toBeGreaterThan(POSTER_POLL_LIMIT * 2);
    expect(POSTER_POLL_WINDOW_MS).toBeGreaterThanOrEqual(30 * 60_000);
  });
});
