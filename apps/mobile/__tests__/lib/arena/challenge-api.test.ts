/**
 * The Arena's challenge chokepoint (timekeeper mode ARCHITECTURE 2.7, PR3):
 * the shipped behaviour. Each call is the shared wrapper with the app's
 * client and the caller's arguments, and hands back the wrapper's `Result`
 * untouched, success or refusal. (The timekeeper-mode busy refusals are
 * slice M6's cases.) The handshake itself only ever goes through here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "app-client" } }));

const mockCreate = jest.fn();
const mockAccept = jest.fn();
const mockStart = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  createChallenge: (...a: unknown[]) => mockCreate(...a),
  acceptChallenge: (...a: unknown[]) => mockAccept(...a),
  startMatchFromChallenge: (...a: unknown[]) => mockStart(...a),
}));

import { supabase as mockClient } from "@/lib/supabase/client";
import { acceptArenaChallenge, createArenaChallenge, startArenaMatch } from "@/lib/arena/challenge-api";

const REFUSED = { ok: false, error: { code: "MAX_PENDING_CHALLENGES", message: "You have 3 pending challenges." } };

beforeEach(() => jest.clearAllMocks());

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

describe("the one door", () => {
  it("the Arena handshake creates, accepts and starts only through the chokepoint", () => {
    const hook = readFileSync(join(__dirname, "..", "..", "..", "lib", "arena", "use-arena-challenge.ts"), "utf8");
    expect(hook).not.toMatch(/\b(createChallenge|acceptChallenge|startMatchFromChallenge)\(/);
    expect(hook).toMatch(/from "\.\/challenge-api"/);
  });
});
