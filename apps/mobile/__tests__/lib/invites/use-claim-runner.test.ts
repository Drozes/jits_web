/**
 * The claim runner end to end over mocked RPCs (jr_be spec 016, plan 10):
 * a denied location still claims (and books) and logs location_denied; a
 * token that is not a challenge falls back to accept_join_invite; terminal
 * results clear the pending invite, retryable ones keep it.
 *
 * Source: apps/mobile/lib/invites/use-claim-runner.ts
 */
import { act, renderHook } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PENDING_INVITE_KEY, makePendingInvite } from "@/lib/invites/pending-invite";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockRelease = jest.fn(() => Promise.resolve());
jest.mock("@/lib/invites/pending-invite", () => ({
  ...jest.requireActual("@/lib/invites/pending-invite"),
  releasePushDeferral: () => mockRelease(),
}));
const mockReading = jest.fn();
jest.mock("@/lib/invites/location", () => ({ readLocationOnce: (...a: unknown[]) => mockReading(...a) }));
const mockClaim = jest.fn();
const mockJoin = jest.fn();
const mockLog = jest.fn(() => Promise.resolve({ ok: true, data: { logged: true } }));
const mockSetDob = jest.fn();
jest.mock("@jits/shared/api/invites", () => ({
  setMyDateOfBirth: (...a: unknown[]) => mockSetDob(...a),
  claimChallengeInvite: (...a: unknown[]) => mockClaim(...a),
  acceptJoinInvite: (...a: unknown[]) => mockJoin(...a),
  logInviteEvent: (...a: unknown[]) => mockLog(...(a as [])),
}));

import { useClaimRunner } from "@/lib/invites/use-claim-runner";

const TOKEN = "Ab3_dE-fGhIjKlMnOpQrSt";
const inviter = { athlete_id: "a1", first_name: "Alex", display_name: "Alex R" };

async function runWith(pending: ReturnType<typeof makePendingInvite>) {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(pending));
  const hook = renderHook(() => useClaimRunner(pending, "active"));
  await act(async () => {
    await hook.result.current.run();
  });
  return hook;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

const NOT_A_JOIN = { ok: true, data: { ok: false, code: "invalid" } };

it("location denied: claims without a reading, books, logs location_denied, clears the invite", async () => {
  mockJoin.mockResolvedValue(NOT_A_JOIN);
  mockReading.mockResolvedValue({ status: "denied", canAskAgain: false });
  mockClaim.mockResolvedValue({
    ok: true,
    data: { ok: true, result: "booked", challenge_id: "c1", match_id: null, inviter, start_blocked_reason: "no_location" },
  });
  const { result } = await runWith(makePendingInvite({ token: TOKEN }, "universal_link"));
  expect(mockClaim).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ token: TOKEN }), null);
  expect(mockLog).toHaveBeenCalledWith(expect.anything(), "location_denied", expect.objectContaining({ detail: { context: "claim" } }));
  expect(result.current.locationDenied).toBe(true);
  expect(result.current.state).toMatchObject({ phase: "done", step: { type: "booked", locationOff: true } });
  expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
});

it("a join link becomes a friendship with no location prompt and no claim, and releases the push deferral", async () => {
  mockJoin.mockResolvedValue({ ok: true, data: { ok: true, result: "friends", inviter } });
  const { result } = await runWith(makePendingInvite({ token: TOKEN }, "universal_link"));
  expect(mockJoin).toHaveBeenCalledWith(expect.anything(), TOKEN, expect.objectContaining({ platform: "ios" }));
  expect(mockReading).not.toHaveBeenCalled();
  expect(mockClaim).not.toHaveBeenCalled();
  expect(mockLog).not.toHaveBeenCalledWith(expect.anything(), "location_denied", expect.anything());
  expect(result.current.state).toMatchObject({ step: { type: "friends", inviterName: "Alex", already: false } });
  expect(mockRelease).toHaveBeenCalled();
  expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
});

it("a scanned join QR is attributed as 'qr', not as a universal link", async () => {
  mockJoin.mockResolvedValue({ ok: true, data: { ok: true, result: "friends", inviter } });
  await runWith(makePendingInvite({ token: TOKEN }, "qr"));
  expect(mockJoin).toHaveBeenCalledWith(expect.anything(), TOKEN, { gateway: "qr", platform: "ios" });
});

it("already_friends right after signup (attribution made the friendship) reads as now friends", async () => {
  mockJoin.mockResolvedValue({ ok: true, data: { ok: true, result: "already_friends", inviter } });
  const pending = makePendingInvite({ token: TOKEN }, "universal_link");
  const { result } = renderHook(() => useClaimRunner(pending, "active", { newAccount: true }));
  await act(async () => {
    await result.current.run();
  });
  expect(result.current.state).toMatchObject({ step: { type: "friends", already: false } });
});

it("a challenge token reads a location only after accept_join_invite says it is not a join link", async () => {
  mockJoin.mockResolvedValue(NOT_A_JOIN);
  mockReading.mockResolvedValue({ status: "ok", reading: { lat: 1, lng: 2, accuracyM: 10 } });
  mockClaim.mockResolvedValue({
    ok: true,
    data: { ok: true, result: "started", challenge_id: "c1", match_id: "m1", inviter, start_blocked_reason: null },
  });
  const { result } = await runWith(makePendingInvite({ token: TOKEN }, "universal_link"));
  expect(mockReading).toHaveBeenCalledWith({ ask: true });
  expect(mockClaim).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ token: TOKEN }), { lat: 1, lng: 2, accuracyM: 10 });
  expect(result.current.state).toMatchObject({ step: { type: "go_match", matchId: "m1" } });
  expect(mockRelease).not.toHaveBeenCalled();
});

it("a token that is neither a join nor a challenge ends with the invalid-link copy", async () => {
  mockJoin.mockResolvedValue(NOT_A_JOIN);
  mockReading.mockResolvedValue({ status: "unavailable" });
  mockClaim.mockResolvedValue({ ok: true, data: { ok: false, code: "invalid", inviter: null } });
  const { result } = await runWith(makePendingInvite({ token: TOKEN }, "universal_link"));
  expect(result.current.state).toMatchObject({ step: { type: "message", terminal: true } });
  expect(mockJoin).toHaveBeenCalledTimes(1);
});

it("a code skips accept_join_invite", async () => {
  mockReading.mockResolvedValue({ status: "unavailable" });
  mockClaim.mockResolvedValue({ ok: true, data: { ok: false, code: "invalid", inviter: null, attempts_left: 3 } });
  const { result } = await runWith(makePendingInvite({ code: "K7Q4M2" }, "code"));
  expect(mockJoin).not.toHaveBeenCalled();
  expect(result.current.state).toMatchObject({ step: { type: "message", terminal: false } });
});

it("a network failure is retryable and keeps the pending invite", async () => {
  mockJoin.mockResolvedValue(NOT_A_JOIN);
  mockReading.mockResolvedValue({ status: "unavailable" });
  mockClaim.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "offline" } });
  const { result } = await runWith(makePendingInvite({ token: TOKEN }, "universal_link"));
  expect(result.current.state).toMatchObject({ step: { type: "message", terminal: false } });
  expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).not.toBeNull();
});

describe("dob_required", () => {
  const DOB_REQUIRED = { ok: true, data: { ok: false, code: "dob_required", inviter } };
  const BOOKED = {
    ok: true,
    data: { ok: true, result: "booked", challenge_id: "c1", match_id: null, inviter, start_blocked_reason: "no_location" },
  };

  async function reachDob(onDobSaved = jest.fn()) {
    const pending = makePendingInvite({ token: TOKEN }, "universal_link");
    await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(pending));
    mockJoin.mockResolvedValue(NOT_A_JOIN);
    mockReading.mockResolvedValue({ status: "unavailable" });
    mockClaim.mockResolvedValueOnce(DOB_REQUIRED);
    const hook = renderHook(() => useClaimRunner(pending, "active", { athleteId: "me", onDobSaved }));
    await act(async () => {
      await hook.result.current.run();
    });
    return hook;
  }

  it("asks for the date of birth, keeps the invite and does not release the push deferral", async () => {
    const { result } = await reachDob();
    expect(result.current.state).toMatchObject({ phase: "done", step: { type: "dob" } });
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).not.toBeNull();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("saves the date of birth, then claims again with the same token and books", async () => {
    const onDobSaved = jest.fn();
    const { result } = await reachDob(onDobSaved);
    mockSetDob.mockResolvedValue({ ok: true, data: { date_of_birth: "1990-05-01" } });
    mockClaim.mockResolvedValueOnce(BOOKED);
    await act(async () => {
      await result.current.submitDob("1990-05-01");
    });
    expect(mockSetDob).toHaveBeenCalledWith(expect.anything(), "me", "1990-05-01");
    expect(onDobSaved).toHaveBeenCalled();
    expect(mockClaim).toHaveBeenCalledTimes(2);
    expect(mockClaim.mock.calls[1][1]).toMatchObject({ token: TOKEN, gateway: "universal_link" });
    // The retry goes straight to the claim, not back through accept_join_invite.
    expect(mockJoin).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({ step: { type: "booked" } });
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });

  it("an under-16 date comes back underage and shows the underage copy", async () => {
    const { result } = await reachDob();
    mockSetDob.mockResolvedValue({ ok: true, data: { date_of_birth: "2015-01-01" } });
    mockClaim.mockResolvedValueOnce({ ok: true, data: { ok: false, code: "underage", inviter } });
    await act(async () => {
      await result.current.submitDob("2015-01-01");
    });
    expect(result.current.state).toMatchObject({
      step: { type: "message", message: "You must be 16 or older to compete on ELO RATED.", terminal: true },
    });
  });

  it("a failed save stays on the date of birth step with an error and does not claim", async () => {
    const { result } = await reachDob();
    mockSetDob.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "offline" } });
    await act(async () => {
      await result.current.submitDob("1990-05-01");
    });
    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({ step: { type: "dob" } });
    expect(result.current.dobError).toBe("Couldn't save your date of birth. Check your connection and try again.");
  });

  it("with no athlete row loaded, says the save failed instead of doing nothing", async () => {
    const pending = makePendingInvite({ token: TOKEN }, "universal_link");
    await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(pending));
    mockJoin.mockResolvedValue(NOT_A_JOIN);
    mockReading.mockResolvedValue({ status: "unavailable" });
    mockClaim.mockResolvedValueOnce(DOB_REQUIRED);
    const { result } = renderHook(() => useClaimRunner(pending, "active", { athleteId: null }));
    await act(async () => {
      await result.current.run();
    });
    await act(async () => {
      await result.current.submitDob("1990-05-01");
    });
    expect(mockSetDob).not.toHaveBeenCalled();
    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({ phase: "done", step: { type: "dob" } });
    expect(result.current.dobError).toBe("Couldn't save your date of birth. Check your connection and try again.");
  });

  it("trims padded input before saving", async () => {
    const { result } = await reachDob();
    mockSetDob.mockResolvedValue({ ok: true, data: { date_of_birth: "1990-05-01" } });
    mockClaim.mockResolvedValueOnce(BOOKED);
    await act(async () => {
      await result.current.submitDob(" 1990-05-01 ");
    });
    expect(mockSetDob).toHaveBeenCalledWith(expect.anything(), "me", "1990-05-01");
  });
});

it("M1: a claim booked with start_available turns the client flag off (the owner flipped it)", async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const flag = require("@/lib/arena/match-location-flag") as typeof import("@/lib/arena/match-location-flag");
  flag.markMatchLocationRequired(true);
  mockJoin.mockResolvedValue(NOT_A_JOIN);
  mockReading.mockResolvedValue({ status: "ok", reading: { lat: 1, lng: 2, accuracyM: 10 } });
  mockClaim.mockResolvedValue({
    ok: true,
    data: { ok: true, result: "booked", challenge_id: "c1", match_id: null, inviter, start_blocked_reason: "start_available" },
  });
  await runWith(makePendingInvite({ token: TOKEN }, "universal_link"));
  await expect(flag.readMatchLocationRequired()).resolves.toBe(false);
});
