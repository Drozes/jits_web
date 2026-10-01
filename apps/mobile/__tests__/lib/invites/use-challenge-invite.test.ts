/**
 * The inviter's waiting state (jr_be spec 016, AC1.4 to AC1.6): limits show
 * the named copy, a claim seen by realtime OR by the fallback read settles
 * once, and settles to the face-off when the server starts the match, else
 * to the booking.
 *
 * Source: apps/mobile/lib/invites/use-challenge-invite.ts
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
  },
}));
const mockReading = jest.fn();
jest.mock("@/lib/invites/location", () => ({ readLocationOnce: (...a: unknown[]) => mockReading(...a) }));

const mockCreate = jest.fn();
const mockPresence = jest.fn();
const mockStatus = jest.fn();
const mockBookings = jest.fn();
const mockRevoke = jest.fn();
const mockRefresh = jest.fn();
// eslint-disable-next-line no-var
var mockOnRow: ((row: { status: string; claimed_by: string | null; challenge_id: string | null }) => void) | null = null;
jest.mock("@jits/shared/api/invites", () => ({
  createInvite: (...a: unknown[]) => mockCreate(...a),
  refreshInviteCode: (...a: unknown[]) => mockRefresh(...a),
  revokeInvite: (...a: unknown[]) => mockRevoke(...a),
  getInviteStatus: (...a: unknown[]) => mockStatus(...a),
  getMyBookings: (...a: unknown[]) => mockBookings(...a),
  reportMatchPresence: (...a: unknown[]) => mockPresence(...a),
  logInviteEvent: jest.fn(() => Promise.resolve({ ok: true, data: { logged: true } })),
  subscribeToInvite: (_s: unknown, _id: string, cb: typeof mockOnRow) => {
    mockOnRow = cb;
    return () => {
      mockOnRow = null;
    };
  },
}));

import { useChallengeInvite } from "@/lib/invites/use-challenge-invite";

const INVITE = {
  invite_id: "i1",
  kind: "challenge",
  token: "t",
  url: "https://elorated.com/c/t",
  scheme_url: "elorated://c/t",
  short_code: "K7Q4M2",
  short_code_display: "K7Q-4M2",
  link_expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
  code_expires_at: new Date(Date.now() + 30 * 60e3).toISOString(),
};
const READING = { status: "ok", reading: { lat: 1, lng: 2, accuracyM: 10 } };

beforeEach(() => {
  jest.clearAllMocks();
  mockOnRow = null;
  mockReading.mockResolvedValue(READING);
  mockStatus.mockResolvedValue({ status: "open", claimed_by: null, challenge_id: null });
  mockPresence.mockResolvedValue({ ok: true, data: { ok: true, verdict: "waiting", started: false, match_id: null } });
  mockBookings.mockResolvedValue({ ok: true, data: [] });
  mockRevoke.mockResolvedValue({ ok: true, data: { invite_id: "i1", status: "revoked" } });
});

it("shows the named limit copy when creation is refused", async () => {
  mockCreate.mockResolvedValue({ ok: false, error: { hint: "too_many_open_invites", message: "" } });
  const { result } = renderHook(() => useChallengeInvite("arena"));
  await waitFor(() =>
    expect(result.current.phase).toEqual({
      kind: "error",
      message: "You have 5 open challenges. Revoke one to send another.",
      hint: "too_many_open_invites",
    }),
  );
  expect(mockCreate).toHaveBeenCalledTimes(1);
});

it("opens, reports invite_waiting presence, and goes to the face-off once the claim starts the match", async () => {
  mockCreate.mockResolvedValue({ ok: true, data: INVITE });
  const { result } = renderHook(() => useChallengeInvite("arena"));
  await waitFor(() => expect(result.current.phase.kind).toBe("open"));
  await waitFor(() =>
    expect(mockPresence).toHaveBeenCalledWith(expect.anything(), READING.reading, "invite_waiting", { inviteId: "i1" }),
  );
  mockPresence.mockResolvedValue({ ok: true, data: { ok: true, verdict: "already_started", started: true, match_id: "m1" } });
  await act(async () => {
    mockOnRow?.({ status: "claimed", claimed_by: "b", challenge_id: "c1" });
  });
  await waitFor(() => expect(result.current.phase).toEqual({ kind: "started", matchId: "m1" }));
  expect(mockPresence).toHaveBeenCalledWith(expect.anything(), READING.reading, "booking_open", { challengeId: "c1" });
});

it("falls back to the row read when realtime missed the claim, and books when nothing started", async () => {
  mockCreate.mockResolvedValue({ ok: true, data: INVITE });
  mockStatus.mockResolvedValue({ status: "claimed", claimed_by: "b", challenge_id: "c1" });
  mockReading.mockResolvedValue({ status: "denied" });
  mockBookings.mockResolvedValue({
    ok: true,
    data: [{ challenge_id: "c1", opponent: { first_name: "Sam", display_name: "Sam K" } }],
  });
  const { result } = renderHook(() => useChallengeInvite(null));
  await waitFor(() => expect(result.current.phase).toEqual({ kind: "booked", challengeId: "c1", opponentName: "Sam" }));
});

describe("leaving the screen (orphaned invites count toward the 5-open limit)", () => {
  it("withdraws an open invite that was never shared or kept", async () => {
    mockCreate.mockResolvedValue({ ok: true, data: INVITE });
    const { result, unmount } = renderHook(() => useChallengeInvite("arena"));
    await waitFor(() => expect(result.current.phase.kind).toBe("open"));
    expect(result.current.wouldWithdrawOnLeave()).toBe(true);
    unmount();
    expect(mockRevoke).toHaveBeenCalledWith(expect.anything(), "i1");
  });

  it("keeps a shared (or explicitly kept) invite open", async () => {
    mockCreate.mockResolvedValue({ ok: true, data: INVITE });
    const { result, unmount } = renderHook(() => useChallengeInvite("arena"));
    await waitFor(() => expect(result.current.phase.kind).toBe("open"));
    act(() => result.current.keepOpen());
    expect(result.current.wouldWithdrawOnLeave()).toBe(false);
    unmount();
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("withdraws an invite whose create resolves after the screen went away", async () => {
    let resolveCreate: (v: unknown) => void = () => {};
    mockCreate.mockReturnValue(new Promise((r) => (resolveCreate = r)));
    const { result, unmount } = renderHook(() => useChallengeInvite("arena"));
    expect(result.current.phase.kind).toBe("creating");
    expect(result.current.wouldWithdrawOnLeave()).toBe(false);
    unmount();
    expect(mockRevoke).not.toHaveBeenCalled();
    await act(async () => {
      resolveCreate({ ok: true, data: { ...INVITE, invite_id: "i-late" } });
    });
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith(expect.anything(), "i-late"));
  });

  it("a create that fails after the screen went away revokes nothing", async () => {
    let resolveCreate: (v: unknown) => void = () => {};
    mockCreate.mockReturnValue(new Promise((r) => (resolveCreate = r)));
    const { unmount } = renderHook(() => useChallengeInvite("arena"));
    unmount();
    await act(async () => {
      resolveCreate({ ok: false, error: { hint: "invite_limit", message: "x" } });
    });
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("never withdraws a claimed invite", async () => {
    mockCreate.mockResolvedValue({ ok: true, data: INVITE });
    const { result, unmount } = renderHook(() => useChallengeInvite("arena"));
    await waitFor(() => expect(result.current.phase.kind).toBe("open"));
    await act(async () => {
      mockOnRow?.({ status: "claimed", claimed_by: "b", challenge_id: "c1" });
    });
    unmount();
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});

it("revoke failures come back with copy", async () => {
  mockCreate.mockResolvedValue({ ok: true, data: INVITE });
  mockRevoke.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "offline" } });
  const { result } = renderHook(() => useChallengeInvite("arena"));
  await waitFor(() => expect(result.current.phase.kind).toBe("open"));
  let res: Awaited<ReturnType<typeof result.current.revoke>> | undefined;
  await act(async () => {
    res = await result.current.revoke();
  });
  expect(res).toEqual({
    ok: false,
    hint: "unknown",
    message: "Couldn't withdraw the challenge. Check your connection and try again.",
  });
  expect(result.current.phase.kind).toBe("open");
});

it("a failed code refresh marks the code stale and retries", async () => {
  jest.useFakeTimers();
  try {
    mockCreate.mockResolvedValue({ ok: true, data: { ...INVITE, code_expires_at: new Date(Date.now() + 1000).toISOString() } });
    mockRefresh.mockResolvedValueOnce({ ok: false, error: { hint: "unknown", message: "offline" } });
    mockRefresh.mockResolvedValueOnce({
      ok: true,
      data: { invite_id: "i1", short_code: "ABCDEF", short_code_display: "ABC-DEF", code_expires_at: new Date(Date.now() + 30 * 60e3).toISOString() },
    });
    const { result } = renderHook(() => useChallengeInvite("arena"));
    await waitFor(() => expect(result.current.phase.kind).toBe("open"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.codeStale).toBe(true);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(16_000);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(2);
    expect(result.current.codeStale).toBe(false);
    expect(result.current.invite?.short_code_display).toBe("ABC-DEF");
  } finally {
    jest.useRealTimers();
  }
});
