/**
 * The Arena's challenge chokepoint (timekeeper mode ARCHITECTURE 2.7, PR3):
 * the shipped behaviour. Each call is the shared wrapper with the app's
 * client and the caller's arguments, and hands back the wrapper's `Result`
 * untouched, success or refusal. The handshake itself only ever goes
 * through here.
 *
 * Slice M6 adds the timekeeper-mode busy refusals (R2, spec 3.4 and 11;
 * review tech minor 10): `TIMEKEEPER_BUSY` and `ATHLETE_IN_TIMEKEEPER_MATCH`
 * withdraw the accepted challenge, are remembered for that challenge once
 * withdrawn, and carry the deck's toast: the shipped title `Couldn't start
 * match` over TK-E2 for the busy timekeeper or TK-E3 for the other athlete.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "app-client" } }));

const mockCreate = jest.fn();
const mockAccept = jest.fn();
const mockStart = jest.fn();
const mockCancel = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  createChallenge: (...a: unknown[]) => mockCreate(...a),
  acceptChallenge: (...a: unknown[]) => mockAccept(...a),
  startMatchFromChallenge: (...a: unknown[]) => mockStart(...a),
  cancelChallenge: (...a: unknown[]) => mockCancel(...a),
}));
const mockBetween = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getChallengesBetween: (...a: unknown[]) => mockBetween(...a),
}));

import { supabase as mockClient } from "@/lib/supabase/client";
import {
  __resetChallengeApiForTests,
  acceptArenaChallenge,
  createArenaChallenge,
  isBusyRefusal,
  isRawRefusal,
  SEND_REFUSED_TOAST,
  startArenaMatch,
} from "@/lib/arena/challenge-api";
import type { DomainError } from "@jits/shared/api/errors";
import { __resetArenaStoreForTests, publishArenaSelfId } from "@/lib/arena/arena-store";

const REFUSED = { ok: false, error: { code: "MAX_PENDING_CHALLENGES", message: "You have 3 pending challenges." } };

beforeEach(() => {
  jest.clearAllMocks();
  __resetChallengeApiForTests();
  __resetArenaStoreForTests();
});

describe("createArenaChallenge", () => {
  it("creates with the app client and returns the new challenge", async () => {
    const created = { ok: true, data: { id: "ch-1", expiresAt: null, createdAt: "2026-10-19T12:00:00Z" } };
    mockCreate.mockResolvedValue(created);
    await expect(createArenaChallenge({ opponentId: "opp-1", challengerWeight: 170 })).resolves.toBe(created);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(mockClient, { opponentId: "opp-1", challengerWeight: 170 });
  });

  it("returns a refusal unchanged", async () => {
    mockCreate.mockResolvedValue(REFUSED);
    await expect(createArenaChallenge({ opponentId: "opp-1" })).resolves.toBe(REFUSED);
  });
});

describe("a refused send's words (timekeeper mode PM31 (2)): isRawRefusal and SEND_REFUSED_TOAST", () => {
  const refusal = (code: string) => ({ code, message: "x" }) as unknown as DomainError;

  it("the send's shipped title over the shipped guidance, written out so a change to either fails here", () => {
    expect(SEND_REFUSED_TOAST).toEqual({ text1: "Couldn't send that challenge.", description: "Check your connection and try again." });
    expect(Object.isFrozen(SEND_REFUSED_TOAST)).toBe(true);
  });

  it.each(["UNKNOWN", "RLS_VIOLATION"])("%s carries raw text (a statement timeout, a dropped connection, an unmapped policy refusal): raw", (code) => {
    expect(isRawRefusal(refusal(code))).toBe(true);
  });

  it.each(["BLOCKED", "MATCH_ALREADY_EXISTS", "MAX_PENDING_CHALLENGES"])(
    "%s carries the shared table's own line: not raw, the handshake shows it",
    (code) => {
      expect(isRawRefusal(refusal(code))).toBe(false);
    },
  );

  it("decided by the code alone: this timekeeper-mode surface never reads an error's words (M-R4)", () => {
    const words = jest.fn(() => "canceling statement due to statement timeout");
    const error = Object.defineProperty({ code: "UNKNOWN" }, "message", { get: words }) as unknown as DomainError;
    expect(isRawRefusal(error)).toBe(true);
    expect(words).not.toHaveBeenCalled();
  });
});

describe("acceptArenaChallenge", () => {
  it("accepts with the app client and the opponent's weight", async () => {
    mockAccept.mockResolvedValue({ ok: true, data: undefined });
    await expect(acceptArenaChallenge({ challengeId: "ch-1", opponentWeight: 168 })).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    expect(mockAccept).toHaveBeenCalledWith(mockClient, { challengeId: "ch-1", opponentWeight: 168 });
  });

  it("returns a refusal unchanged", async () => {
    const refused = { ok: false, error: { code: "RLS_VIOLATION", message: "nope" } };
    mockAccept.mockResolvedValue(refused);
    await expect(acceptArenaChallenge({ challengeId: "ch-1" })).resolves.toBe(refused);
  });
});

describe("startArenaMatch", () => {
  it("starts with the app client and returns the match", async () => {
    const started = { ok: true, data: { match_id: "M1" } };
    mockStart.mockResolvedValue(started);
    await expect(startArenaMatch("ch-1")).resolves.toBe(started);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith(mockClient, "ch-1");
  });

  it("returns a refusal unchanged (no retry, no side effect)", async () => {
    const refused = { ok: false, error: { code: "OPPONENT_INACTIVE", message: "Opponent is not active." } };
    mockStart.mockResolvedValue(refused);
    await expect(startArenaMatch("ch-1")).resolves.toBe(refused);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockAccept).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Timekeeper mode busy refusals (slice M6)
// ---------------------------------------------------------------------------

const ME = "me-1";
const RIVAL = "rival-9";
/** The shipped title every busy toast keeps (COPY-DECK TK-E2, TK-E3). */
const TITLE = "Couldn't start match";

/** A busy refusal as `mapPostgrestError` shapes it: the HINT's code, DETAIL in `raw.details`. */
function busy(code: "TIMEKEEPER_BUSY" | "ATHLETE_IN_TIMEKEEPER_MATCH", busyId: string | null, message = "Timekeeping another match") {
  return {
    ok: false,
    error: {
      code,
      message,
      raw: { code: "P0001", message: "An athlete is busy", details: busyId, hint: code.toLowerCase() },
    },
  };
}

/** The challenge between me and the rival, as `getChallengesBetween` returns it. */
function betweenRow(id = "ch-1") {
  return {
    id,
    status: "accepted",
    challenger: { id: RIVAL, display_name: "Mina Park", current_elo: 1500, profile_photo_url: null },
    opponent: { id: ME, display_name: "Kai Reyes", current_elo: 1512, profile_photo_url: null },
  };
}

describe("startArenaMatch: timekeeper mode busy refusals", () => {
  beforeEach(() => {
    publishArenaSelfId(ME);
    mockCancel.mockResolvedValue({ ok: true, data: { cancelled: true } });
    mockBetween.mockResolvedValue([betweenRow()]);
  });

  it("only the two busy codes are busy refusals", () => {
    expect(isBusyRefusal({ code: "TIMEKEEPER_BUSY", message: "" })).toBe(true);
    expect(isBusyRefusal({ code: "ATHLETE_IN_TIMEKEEPER_MATCH", message: "" })).toBe(true);
    expect(isBusyRefusal({ code: "OPPONENT_INACTIVE", message: "" })).toBe(false);
    expect(isBusyRefusal({ code: "CHALLENGE_NOT_ACCEPTED", message: "" })).toBe(false);
  });

  it("I am the busy timekeeper: TK-E2 under the shipped title, and the accepted challenge is withdrawn", async () => {
    mockStart.mockResolvedValue(busy("TIMEKEEPER_BUSY", ME));
    const res = await startArenaMatch("ch-1");
    expect(res).toMatchObject({
      ok: false,
      error: {
        code: "TIMEKEEPER_BUSY",
        message: "You're timekeeping another match.",
        toast: { text1: TITLE, description: "You're timekeeping another match." },
      },
    });
    // Withdrawn only while still accepted: a started match is never cancelled.
    expect(mockCancel).toHaveBeenCalledWith(mockClient, "ch-1", { onlyIfAccepted: true });
    // My own refusal needs no name.
    expect(mockBetween).not.toHaveBeenCalled();
  });

  it.each(["TIMEKEEPER_BUSY", "ATHLETE_IN_TIMEKEEPER_MATCH"] as const)(
    "the other athlete is busy (%s): TK-E3 with their name, and the challenge is withdrawn",
    async (code) => {
      mockStart.mockResolvedValue(busy(code, RIVAL));
      const res = await startArenaMatch("ch-1");
      expect(res).toMatchObject({
        ok: false,
        error: { code, message: "Mina Park is busy in another match.", toast: { text1: TITLE, description: "Mina Park is busy in another match." } },
      });
      expect(mockBetween).toHaveBeenCalledWith(mockClient, ME, RIVAL);
      expect(mockCancel).toHaveBeenCalledWith(mockClient, "ch-1", { onlyIfAccepted: true });
    },
  );

  it("the refusal is final for the challenge: later starts never ask the server again (no retry loop)", async () => {
    mockStart.mockResolvedValue(busy("TIMEKEEPER_BUSY", ME));
    const first = await startArenaMatch("ch-1");
    // The accepter's own retry, its withdraw-then-start, the challenger's 12 s fallback.
    const again = [await startArenaMatch("ch-1"), await startArenaMatch("ch-1"), await startArenaMatch("ch-1")];
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledTimes(1);
    for (const r of again) expect(r).toBe(first);
    // Another challenge is its own question.
    mockStart.mockResolvedValue({ ok: true, data: { match_id: "M2" } });
    await expect(startArenaMatch("ch-2")).resolves.toEqual({ ok: true, data: { match_id: "M2" } });
  });

  it("I am the busy COMPETITOR: never TK-E2 (that is the timekeeper's line), the shipped title alone", async () => {
    // The viewer competes in another timekeeper-mode match; the deck has no
    // line for this yet, and `You're timekeeping another match.` is false.
    mockStart.mockResolvedValue(busy("ATHLETE_IN_TIMEKEEPER_MATCH", ME, "raw server text"));
    const res = await startArenaMatch("ch-1");
    expect(res).toMatchObject({ ok: false, error: { code: "ATHLETE_IN_TIMEKEEPER_MATCH", message: TITLE } });
    expect(res.ok ? null : res.error.toast).toEqual({ text1: TITLE });
    expect(JSON.stringify(res)).not.toMatch(/timekeeping/);
    expect(mockBetween).not.toHaveBeenCalled();
    expect(mockCancel).toHaveBeenCalledWith(mockClient, "ch-1", { onlyIfAccepted: true });
  });

  it("a withdraw that changed no row is not remembered: a start the other side made is returned untouched", async () => {
    // No longer `accepted`: the other side may have started it after all.
    mockCancel.mockResolvedValue({ ok: true, data: { cancelled: false } });
    mockStart.mockResolvedValueOnce(busy("TIMEKEEPER_BUSY", ME));
    const refused = await startArenaMatch("ch-1");
    expect(refused.ok).toBe(false);
    const started = { ok: true, data: { match_id: "M1" } };
    mockStart.mockResolvedValueOnce(started);
    await expect(startArenaMatch("ch-1")).resolves.toBe(started);
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it("a withdraw that failed (offline) is not remembered: the next start asks again", async () => {
    mockCancel.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    mockStart.mockResolvedValue(busy("TIMEKEEPER_BUSY", ME));
    await startArenaMatch("ch-1");
    await startArenaMatch("ch-1");
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it("without my id, or the other's name, the deck's subject-free words (TK-P8, TK-P9), never the raw message", async () => {
    publishArenaSelfId(null);
    mockStart.mockResolvedValue(busy("TIMEKEEPER_BUSY", RIVAL, "raw server text"));
    await expect(startArenaMatch("ch-1")).resolves.toMatchObject({
      error: { message: "Timekeeping another match", toast: { text1: TITLE, description: "Timekeeping another match" } },
    });

    publishArenaSelfId(ME);
    mockBetween.mockResolvedValue([]);
    mockStart.mockResolvedValue(busy("ATHLETE_IN_TIMEKEEPER_MATCH", RIVAL, "raw server text"));
    await expect(startArenaMatch("ch-2")).resolves.toMatchObject({ error: { message: "Running their own match" } });

    mockStart.mockResolvedValue(busy("ATHLETE_IN_TIMEKEEPER_MATCH", null, "raw server text"));
    await expect(startArenaMatch("ch-3")).resolves.toMatchObject({ error: { message: "Running their own match" } });
  });

  it("any other refusal is untouched: no toast, no withdraw, nothing remembered", async () => {
    const refused = { ok: false, error: { code: "OPPONENT_INACTIVE", message: "Opponent is not active." } };
    mockStart.mockResolvedValue(refused);
    await expect(startArenaMatch("ch-1")).resolves.toBe(refused);
    expect(refused.error).not.toHaveProperty("toast");
    await expect(startArenaMatch("ch-1")).resolves.toBe(refused);
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe("the one door", () => {
  it("the Arena handshake creates, accepts and starts only through the chokepoint", () => {
    const hook = readFileSync(join(__dirname, "..", "..", "..", "lib", "arena", "use-arena-challenge.ts"), "utf8");
    expect(hook).not.toMatch(/\b(createChallenge|acceptChallenge|startMatchFromChallenge)\(/);
    expect(hook).toMatch(/from "\.\/challenge-api"/);
  });
});
