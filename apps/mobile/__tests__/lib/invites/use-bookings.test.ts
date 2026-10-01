/**
 * The Arena's invite bookings (jr_be spec 016, US5 and contract 7): a started
 * match routes, a closed booking leaves with a toast, a busy athlete and a
 * coarse reading are kept per booking for the strip, location states are
 * told apart (never asked vs denied vs no fix), and a booking cancels through
 * the existing challenge cancel path.
 *
 * Source: apps/mobile/lib/invites/use-bookings.ts
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockMatchRow = jest.fn();
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => mockMatchRow() }) }) }),
  },
}));
const mockReading = jest.fn();
jest.mock("@/lib/invites/location", () => ({ readLocationOnce: (...a: unknown[]) => mockReading(...a) }));
const mockBookings = jest.fn();
const mockPresence = jest.fn();
jest.mock("@jits/shared/api/invites", () => ({
  getMyBookings: (...a: unknown[]) => mockBookings(...a),
  reportMatchPresence: (...a: unknown[]) => mockPresence(...a),
}));
const mockRelease = jest.fn(() => Promise.resolve());
jest.mock("@/lib/invites/pending-invite", () => ({ releasePushDeferral: () => mockRelease() }));
const mockCancel = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({ cancelChallenge: (...a: unknown[]) => mockCancel(...a) }));

const mockStartBooking = jest.fn();
const mockStatusHandlers: Record<string, (status: string) => void> = {};
const mockUnsub = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  startInviteBooking: (...a: unknown[]) => mockStartBooking(...a),
  subscribeToChallengeStatus: (_s: unknown, id: string, cb: (status: string) => void) => {
    mockStatusHandlers[id] = cb;
    return mockUnsub;
  },
}));
const mockMarkLocation = jest.fn();
jest.mock("@/lib/arena/match-location-flag", () => ({
  markMatchLocationRequired: (...a: unknown[]) => mockMarkLocation(...a),
}));

import { useBookings } from "@/lib/invites/use-bookings";

const READING = { status: "ok", reading: { lat: 1, lng: 2, accuracyM: 10 } };
const booking = (id: string) => ({
  challenge_id: id,
  invite_id: `i-${id}`,
  role: "invitee",
  opponent: { athlete_id: "a1", display_name: "Alex R", first_name: "Alex" },
});

function setup() {
  const onStarted = jest.fn();
  const onClosed = jest.fn();
  const hook = renderHook(() => useBookings({ visible: true, onStarted, onClosed }));
  return { ...hook, onStarted, onClosed };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReading.mockResolvedValue(READING);
  mockBookings.mockResolvedValue({ ok: true, data: [booking("c1")] });
  mockMatchRow.mockResolvedValue({ data: null, error: null });
});

it("routes when the server starts the match", async () => {
  mockPresence.mockResolvedValue({ ok: true, data: { ok: true, started: true, match_id: "m1", verdict: "passed" } });
  const { onStarted } = setup();
  await waitFor(() => expect(onStarted).toHaveBeenCalledWith("m1"));
  expect(mockReading).toHaveBeenCalledWith({ ask: false });
});

it("a closed booking leaves the strip with the toast copy", async () => {
  mockPresence.mockResolvedValue({ ok: true, data: { ok: false, code: "booking_closed" } });
  const { result, onClosed } = setup();
  await waitFor(() => expect(onClosed).toHaveBeenCalledWith("This booking was cancelled."));
  expect(result.current.bookings).toEqual([]);
  // The last booking closed without a match: a deferred push prompt is released.
  expect(mockRelease).toHaveBeenCalled();
});

it("a booking_closed start-blocked reason (flag-on proximity path) closes it like the code", async () => {
  mockPresence.mockResolvedValue({
    ok: true,
    data: { ok: true, started: false, match_id: null, verdict: "waiting", start_blocked_reason: "booking_closed" },
  });
  const { result, onClosed } = setup();
  await waitFor(() => expect(onClosed).toHaveBeenCalledWith("This booking was cancelled."));
  expect(result.current.bookings).toEqual([]);
});

it("implausible_movement is kept for the strip and never retried on its own", async () => {
  mockPresence.mockResolvedValue({ ok: true, data: { ok: false, code: "implausible_movement" } });
  const { result } = setup();
  await waitFor(() =>
    expect(result.current.presence.c1).toEqual({ blockedReason: null, accuracyTooLow: false, implausibleMovement: true }),
  );
  const calls = mockPresence.mock.calls.length;
  await act(async () => {
    await Promise.resolve();
  });
  expect(mockPresence.mock.calls.length).toBe(calls);
});

it("a started match does not release the push deferral (the match exit does)", async () => {
  mockPresence.mockResolvedValue({ ok: true, data: { ok: true, started: true, match_id: "m1", verdict: "passed" } });
  const { onStarted } = setup();
  await waitFor(() => expect(onStarted).toHaveBeenCalledWith("m1"));
  expect(mockRelease).not.toHaveBeenCalled();
});

it("keeps the start-blocked reason per booking (a busy athlete)", async () => {
  mockPresence.mockResolvedValue({
    ok: true,
    data: { ok: true, started: false, match_id: null, verdict: "passed", start_blocked_reason: "inviter_busy" },
  });
  const { result } = setup();
  await waitFor(() =>
    expect(result.current.presence.c1).toEqual({ blockedReason: "inviter_busy", accuracyTooLow: false }),
  );
});

it("keeps accuracy_too_low, and Try again sends a fresh reading", async () => {
  mockPresence.mockResolvedValue({ ok: true, data: { ok: false, code: "accuracy_too_low" } });
  const { result } = setup();
  await waitFor(() => expect(result.current.presence.c1).toEqual({ blockedReason: null, accuracyTooLow: true }));
  mockPresence.mockResolvedValue({
    ok: true,
    data: { ok: true, started: false, match_id: null, verdict: "waiting", start_blocked_reason: "waiting" },
  });
  await act(async () => {
    await result.current.retry();
  });
  expect(result.current.presence.c1).toEqual({ blockedReason: "waiting", accuracyTooLow: false });
});

it("never asked: 'ask', and askLocation shows the system prompt", async () => {
  mockReading.mockResolvedValue({ status: "denied", canAskAgain: true });
  const { result } = setup();
  await waitFor(() => expect(result.current.location).toBe("ask"));
  mockReading.mockResolvedValue(READING);
  mockPresence.mockResolvedValue({ ok: true, data: { ok: true, started: false, match_id: null, verdict: "waiting" } });
  await act(async () => {
    await result.current.askLocation();
  });
  expect(mockReading).toHaveBeenLastCalledWith({ ask: true });
  expect(result.current.location).toBe("ok");
});

it("a real denial is 'denied'; no fix in time is 'unavailable'", async () => {
  mockReading.mockResolvedValue({ status: "denied", canAskAgain: false });
  const a = setup();
  await waitFor(() => expect(a.result.current.location).toBe("denied"));
  a.unmount();
  mockReading.mockResolvedValue({ status: "unavailable" });
  const b = setup();
  await waitFor(() => expect(b.result.current.location).toBe("unavailable"));
  expect(mockPresence).not.toHaveBeenCalled();
});

it("cancels a booking through the challenge cancel path", async () => {
  mockPresence.mockResolvedValue({ ok: true, data: { ok: true, started: false, match_id: null, verdict: "waiting" } });
  mockCancel.mockResolvedValue({ ok: true, data: { cancelled: true } });
  const { result } = setup();
  await waitFor(() => expect(result.current.bookings).toHaveLength(1));
  let out = "";
  await act(async () => {
    out = await result.current.cancel("c1");
  });
  expect(out).toBe("cancelled");
  expect(mockCancel).toHaveBeenCalledWith(expect.anything(), "c1", { onlyIfAccepted: true });
  expect(result.current.bookings).toEqual([]);
  expect(mockRelease).toHaveBeenCalled();
});

it("a failed cancel keeps the booking", async () => {
  mockPresence.mockResolvedValue({ ok: true, data: { ok: true, started: false, match_id: null, verdict: "waiting" } });
  mockCancel.mockResolvedValue({ ok: false, error: { message: "offline" } });
  const { result } = setup();
  await waitFor(() => expect(result.current.bookings).toHaveLength(1));
  let out = "";
  await act(async () => {
    out = await result.current.cancel("c1");
  });
  expect(out).toBe("failed");
  expect(result.current.bookings).toHaveLength(1);
});

it("a booking the server started a moment earlier routes to the face-off, not 'cancelled'", async () => {
  mockPresence.mockResolvedValue({ ok: true, data: { ok: true, started: false, match_id: null, verdict: "waiting" } });
  mockCancel.mockResolvedValue({ ok: true, data: { cancelled: false } });
  mockMatchRow.mockResolvedValue({ data: { id: "m9" }, error: null });
  const { result, onStarted } = setup();
  await waitFor(() => expect(result.current.bookings).toHaveLength(1));
  let out = "";
  await act(async () => {
    out = await result.current.cancel("c1");
  });
  expect(out).toBe("too_late");
  expect(onStarted).toHaveBeenCalledWith("m9");
  expect(result.current.bookings).toEqual([]);
});

it("nothing cancelled and no match: reloads, and a booking that closed reads 'too_late'", async () => {
  mockPresence.mockResolvedValue({ ok: true, data: { ok: true, started: false, match_id: null, verdict: "waiting" } });
  mockCancel.mockResolvedValue({ ok: true, data: { cancelled: false } });
  const { result } = setup();
  await waitFor(() => expect(result.current.bookings).toHaveLength(1));
  mockBookings.mockResolvedValue({ ok: true, data: [] });
  let out = "";
  await act(async () => {
    out = await result.current.cancel("c1");
  });
  expect(out).toBe("too_late");
  expect(result.current.bookings).toEqual([]);
});

it("nothing cancelled but the booking is still open reads 'failed'", async () => {
  mockPresence.mockResolvedValue({ ok: true, data: { ok: true, started: false, match_id: null, verdict: "waiting" } });
  mockCancel.mockResolvedValue({ ok: true, data: { cancelled: false } });
  const { result } = setup();
  await waitFor(() => expect(result.current.bookings).toHaveLength(1));
  let out = "";
  await act(async () => {
    out = await result.current.cancel("c1");
  });
  expect(out).toBe("failed");
  expect(result.current.bookings).toHaveLength(1);
});

describe("match_location_required off (Start match)", () => {
  function setupOff(list = [booking("c1")]) {
    mockBookings.mockResolvedValue({ ok: true, data: list });
    const onStarted = jest.fn();
    const onClosed = jest.fn();
    const hook = renderHook(() => useBookings({ visible: true, onStarted, onClosed, locationRequired: false }));
    return { ...hook, onStarted, onClosed };
  }

  beforeEach(() => {
    for (const k of Object.keys(mockStatusHandlers)) delete mockStatusHandlers[k];
  });

  it("reads no location and reports no presence", async () => {
    const { result } = setupOff();
    await waitFor(() => expect(result.current.bookings).toHaveLength(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockReading).not.toHaveBeenCalled();
    expect(mockPresence).not.toHaveBeenCalled();
  });

  it("Start match starts the booking and routes to the face-off", async () => {
    mockStartBooking.mockResolvedValue({ ok: true, data: { ok: true, match_id: "m1" } });
    const { result, onStarted } = setupOff();
    await waitFor(() => expect(result.current.bookings).toHaveLength(1));
    let out = "";
    await act(async () => {
      out = await result.current.start("c1");
    });
    expect(out).toBe("started");
    expect(mockStartBooking).toHaveBeenCalledWith(expect.anything(), "c1");
    expect(onStarted).toHaveBeenCalledWith("m1");
    expect(result.current.starting.c1).toBeUndefined();
  });

  it.each([
    ["inviter_busy", "Alex is mid-match. We'll hold your spot."],
    ["claimer_busy", "Finish your match first."],
    ["inviter_weekly_cap", "No invite matches left this week."],
    ["mystery_code", "Couldn't start. Try again."],
  ])("%s keeps the booking with its copy (invitee side)", async (code, short) => {
    mockStartBooking.mockResolvedValue({ ok: true, data: { ok: false, code } });
    const { result, onStarted } = setupOff();
    await waitFor(() => expect(result.current.bookings).toHaveLength(1));
    await act(async () => {
      await result.current.start("c1");
    });
    expect(onStarted).not.toHaveBeenCalled();
    expect(result.current.bookings).toHaveLength(1);
    expect(result.current.startErrors.c1.short).toBe(short);
  });

  it("the busy copy follows my side of the booking (inviter)", async () => {
    mockStartBooking.mockResolvedValue({ ok: true, data: { ok: false, code: "inviter_busy" } });
    const { result } = setupOff([{ ...booking("c1"), role: "inviter" }]);
    await waitFor(() => expect(result.current.bookings).toHaveLength(1));
    await act(async () => {
      await result.current.start("c1");
    });
    expect(result.current.startErrors.c1.short).toBe("Finish your match first.");
  });

  it("booking_closed removes the strip with the toast copy", async () => {
    mockStartBooking.mockResolvedValue({ ok: true, data: { ok: false, code: "booking_closed" } });
    const { result, onClosed } = setupOff();
    await waitFor(() => expect(result.current.bookings).toHaveLength(1));
    await act(async () => {
      await result.current.start("c1");
    });
    expect(result.current.bookings).toEqual([]);
    expect(onClosed).toHaveBeenCalledWith("This booking was cancelled.");
  });

  it("location_required turns the flag on (the server says it is on)", async () => {
    mockStartBooking.mockResolvedValue({ ok: true, data: { ok: false, code: "location_required" } });
    const { result } = setupOff();
    await waitFor(() => expect(result.current.bookings).toHaveLength(1));
    await act(async () => {
      await result.current.start("c1");
    });
    expect(mockMarkLocation).toHaveBeenCalledWith(true);
    expect(result.current.startErrors.c1.short).toBe("Location needed to start. Try again.");
  });

  it("a failed call (network) is said, never swallowed", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockStartBooking.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "offline" } });
    const { result } = setupOff();
    await waitFor(() => expect(result.current.bookings).toHaveLength(1));
    let out = "";
    await act(async () => {
      out = await result.current.start("c1");
    });
    expect(out).toBe("failed");
    expect(result.current.startErrors.c1.short).toBe("Couldn't start. Try again.");
  });

  it("the other athlete's Start match (realtime started) routes here once", async () => {
    mockStartBooking.mockResolvedValue({ ok: true, data: { ok: true, match_id: "m2" } });
    const { result, onStarted } = setupOff();
    await waitFor(() => expect(mockStatusHandlers.c1).toBeDefined());
    await act(async () => {
      mockStatusHandlers.c1("started");
      await Promise.resolve();
    });
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("m2"));
    // My own tap answering with the same match does not route twice.
    await act(async () => {
      await result.current.start("c1");
    });
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  it("a cancel from the other side closes the booking", async () => {
    const { result, onClosed } = setupOff();
    await waitFor(() => expect(mockStatusHandlers.c1).toBeDefined());
    act(() => mockStatusHandlers.c1("cancelled"));
    expect(result.current.bookings).toEqual([]);
    expect(onClosed).toHaveBeenCalledWith("This booking was cancelled.");
  });

  it("subscribes only while visible and with the flag off", async () => {
    mockPresence.mockResolvedValue({ ok: true, data: { ok: true, started: false, match_id: null, verdict: "waiting" } });
    const { result } = setup();
    await waitFor(() => expect(result.current.bookings).toHaveLength(1));
    expect(mockStatusHandlers.c1).toBeUndefined();
  });
});

describe("the flag as the strip's server answers say (M1, L4)", () => {
  it("a start_available reading reply turns the flag off (only a flag-off server says it)", async () => {
    mockPresence.mockResolvedValue({
      ok: true,
      data: { ok: true, verdict: "recorded", started: false, match_id: null, start_blocked_reason: "start_available" },
    });
    setup();
    await waitFor(() => expect(mockMarkLocation).toHaveBeenCalledWith(false));
  });

  it("an unknown flag (null) runs neither the readings nor the Start match realtime", async () => {
    for (const k of Object.keys(mockStatusHandlers)) delete mockStatusHandlers[k];
    const hook = renderHook(() =>
      useBookings({ visible: true, onStarted: jest.fn(), onClosed: jest.fn(), locationRequired: null }),
    );
    await waitFor(() => expect(hook.result.current.bookings).toHaveLength(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockReading).not.toHaveBeenCalled();
    expect(mockPresence).not.toHaveBeenCalled();
    expect(Object.keys(mockStatusHandlers)).toHaveLength(0);
  });
});
