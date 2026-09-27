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
import { disputeLockNote, isDisputeWindowClosed, readMatchExtras } from "@/lib/match-flow/match-extras";
import { rankStripText } from "@/lib/match-flow/use-verdict-data";
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
    } as never;
    expect(readMatchExtras(m)).toEqual({
      winnerId: "a",
      submissionName: "Armbar",
      finishTimeSeconds: 90,
      disputeLocksAt: "2026-09-28T12:00:00Z",
    });
  });

  it("is all null on an older backend or junk", () => {
    expect(readMatchExtras({ id: "M1", finish_time_seconds: "90" } as never)).toEqual({
      winnerId: null,
      submissionName: null,
      finishTimeSeconds: null,
      disputeLocksAt: null,
    });
    expect(readMatchExtras(null).disputeLocksAt).toBeNull();
  });
});

describe("dispute window", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  it("hours, then minutes, then nothing once passed", () => {
    expect(disputeLockNote("2026-09-28T12:00:00Z", now)).toBe("Locks automatically in 24 h if nobody disputes.");
    expect(disputeLockNote("2026-09-27T12:20:00Z", now)).toBe("Locks automatically in 20 min if nobody disputes.");
    expect(disputeLockNote("2026-09-27T11:00:00Z", now)).toBeNull();
    expect(disputeLockNote(null, now)).toBeNull();
  });
  it("closed only once the lock time has passed", () => {
    expect(isDisputeWindowClosed("2026-09-27T11:59:59Z", now)).toBe(true);
    expect(isDisputeWindowClosed("2026-09-27T12:00:01Z", now)).toBe(false);
    expect(isDisputeWindowClosed(null, now)).toBe(false);
  });
});

describe("rankStripText", () => {
  it("a climb with who was passed", () => {
    expect(
      rankStripText(
        { rank_before: 23, rank_after: 19, passed: [{ athlete_id: "x", display_name: "Joao Silva" }, { athlete_id: "y", display_name: "B C" }] },
        shortName,
      ),
    ).toBe("#23 → #19 · PASSED J. SILVA +1");
  });
  it("nothing for no climb, a drop, or an unranked side", () => {
    expect(rankStripText({ rank_before: 19, rank_after: 19, passed: [] }, shortName)).toBeNull();
    expect(rankStripText({ rank_before: 19, rank_after: 23, passed: [] }, shortName)).toBeNull();
    expect(rankStripText({ rank_before: null, rank_after: 40, passed: [] }, shortName)).toBeNull();
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
