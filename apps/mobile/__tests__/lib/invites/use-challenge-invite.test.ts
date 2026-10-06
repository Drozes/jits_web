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

const mockStartBooking = jest.fn();
// eslint-disable-next-line no-var
var mockStatusCb: ((status: string) => void) | null = null;
jest.mock("@jits/shared/api/location", () => ({
  startInviteBooking: (...a: unknown[]) => mockStartBooking(...a),
  subscribeToChallengeStatus: (_s: unknown, _id: string, cb: (status: string) => void) => {
    mockStatusCb = cb;
    return () => {
      mockStatusCb = null;
    };
  },
}));
const mockMarkLocation = jest.fn();
jest.mock("@/lib/arena/match-location-flag", () => ({
  markMatchLocationRequired: (...a: unknown[]) => mockMarkLocation(...a),
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

it("a backend that rejects the entry point (no B5 yet) gets one unattributed retry, so the invite still opens", async () => {
  mockCreate
    .mockResolvedValueOnce({ ok: false, error: { hint: "invalid_entry_point", message: "" } })
    .mockResolvedValueOnce({ ok: true, data: INVITE });
  const { result } = renderHook(() => useChallengeInvite("matches"));
  await waitFor(() => expect(result.current.phase.kind).toBe("open"));
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(mockCreate.mock.calls[0][1]).toBe("matches");
  expect(mockCreate.mock.calls[1][1]).toBeNull();
});

it("never retries invalid_entry_point without an entry point, nor any other error", async () => {
  mockCreate.mockResolvedValue({ ok: false, error: { hint: "invalid_entry_point", message: "" } });
  const none = renderHook(() => useChallengeInvite(null));
  await waitFor(() => expect(none.result.current.phase.kind).toBe("error"));
  expect(mockCreate).toHaveBeenCalledTimes(1);
  // A retry that fails too shows its error (no loop).
  mockCreate.mockClear();
  const twice = renderHook(() => useChallengeInvite("matches"));
  await waitFor(() => expect(twice.result.current.phase.kind).toBe("error"));
  expect(mockCreate).toHaveBeenCalledTimes(2);
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

describe("match_location_required off", () => {
  async function bookedOff() {
    mockCreate.mockResolvedValue({ ok: true, data: INVITE });
    mockBookings.mockResolvedValue({
      ok: true,
      data: [{ challenge_id: "c1", opponent: { first_name: "Sam", display_name: "Sam K" } }],
    });
    const hook = renderHook(() => useChallengeInvite("arena", { locationRequired: false }));
    await waitFor(() => expect(hook.result.current.phase.kind).toBe("open"));
    await act(async () => {
      mockOnRow?.({ status: "claimed", claimed_by: "b", challenge_id: "c1" });
    });
    await waitFor(() => expect(hook.result.current.phase.kind).toBe("booked"));
    return hook;
  }

  it("waits for a claim with no location read and no presence report", async () => {
    const { result } = await bookedOff();
    expect(mockReading).not.toHaveBeenCalled();
    expect(mockPresence).not.toHaveBeenCalled();
    expect(result.current.locationDenied).toBe(false);
    // The row is still re-read (the claim fallback).
    expect(mockStatus).toHaveBeenCalled();
  });

  it("Start match starts the booking and goes to the face-off", async () => {
    mockStartBooking.mockResolvedValue({ ok: true, data: { ok: true, match_id: "m1" } });
    const { result } = await bookedOff();
    await act(async () => {
      await result.current.start();
    });
    expect(mockStartBooking).toHaveBeenCalledWith(expect.anything(), "c1");
    expect(result.current.phase).toEqual({ kind: "started", matchId: "m1" });
  });

  it.each([
    ["inviter_busy", "Finish your current match first. Your booking with Sam is saved."],
    ["claimer_busy", "Sam is mid-match. We'll hold your spot."],
    ["inviter_weekly_cap", "You've played this week's 3 invite matches. Challenge friends from the Arena."],
    ["location_required", "Matches now need your location to start. Allow location, then try again."],
  ])("%s stays booked with the copy for my side", async (code, copy) => {
    mockStartBooking.mockResolvedValue({ ok: true, data: { ok: false, code } });
    const { result } = await bookedOff();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toEqual(
      expect.objectContaining({ kind: "booked", challengeId: "c1", starting: false, startError: copy }),
    );
    expect(mockMarkLocation).toHaveBeenCalledTimes(code === "location_required" ? 1 : 0);
  });

  it("booking_closed closes the booking", async () => {
    mockStartBooking.mockResolvedValue({ ok: true, data: { ok: false, code: "booking_closed" } });
    const { result } = await bookedOff();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toEqual({ kind: "closed" });
  });

  it("a failed call says so instead of nothing", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockStartBooking.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "offline" } });
    const { result } = await bookedOff();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toEqual(
      expect.objectContaining({ startError: "Couldn't start the match. Check your connection and try again." }),
    );
  });

  it("the claimer's Start match (realtime started) takes the inviter to the face-off", async () => {
    mockStartBooking.mockResolvedValue({ ok: true, data: { ok: true, match_id: "m7" } });
    const { result } = await bookedOff();
    await waitFor(() => expect(mockStatusCb).not.toBeNull());
    await act(async () => {
      mockStatusCb?.("started");
    });
    await waitFor(() => expect(result.current.phase).toEqual({ kind: "started", matchId: "m7" }));
  });

  it("a cancelled booking closes", async () => {
    const { result } = await bookedOff();
    await waitFor(() => expect(mockStatusCb).not.toBeNull());
    act(() => mockStatusCb?.("cancelled"));
    expect(result.current.phase).toEqual({ kind: "closed" });
  });
});

describe("the kill switch reaches the inviter (M1)", () => {
  const START_AVAILABLE = {
    ok: true,
    data: { ok: true, verdict: "recorded", started: false, match_id: null, start_blocked_reason: "start_available" },
  };

  it("a claim booked with start_available turns the flag off (booked offers Start match)", async () => {
    mockCreate.mockResolvedValue({ ok: true, data: INVITE });
    const { result } = renderHook(() => useChallengeInvite("arena"));
    await waitFor(() => expect(result.current.phase.kind).toBe("open"));
    mockPresence.mockResolvedValue(START_AVAILABLE);
    await act(async () => {
      mockOnRow?.({ status: "claimed", claimed_by: "b", challenge_id: "c1" });
    });
    await waitFor(() => expect(result.current.phase.kind).toBe("booked"));
    expect(mockMarkLocation).toHaveBeenCalledWith(false);
  });

  it("an invite_waiting reply with start_available turns it off too", async () => {
    mockCreate.mockResolvedValue({ ok: true, data: INVITE });
    mockPresence.mockResolvedValue(START_AVAILABLE);
    renderHook(() => useChallengeInvite("arena"));
    await waitFor(() => expect(mockMarkLocation).toHaveBeenCalledWith(false));
  });

  it("an ordinary reply leaves the flag alone", async () => {
    mockCreate.mockResolvedValue({ ok: true, data: INVITE });
    const { result } = renderHook(() => useChallengeInvite("arena"));
    await waitFor(() => expect(result.current.phase.kind).toBe("open"));
    await waitFor(() => expect(mockPresence).toHaveBeenCalled());
    expect(mockMarkLocation).not.toHaveBeenCalled();
  });
});
