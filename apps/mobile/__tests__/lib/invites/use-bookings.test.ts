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

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockReading = jest.fn();
jest.mock("@/lib/invites/location", () => ({ readLocationOnce: (...a: unknown[]) => mockReading(...a) }));
const mockBookings = jest.fn();
const mockPresence = jest.fn();
jest.mock("@jits/shared/api/invites", () => ({
  getMyBookings: (...a: unknown[]) => mockBookings(...a),
  reportMatchPresence: (...a: unknown[]) => mockPresence(...a),
}));
const mockCancel = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({ cancelChallenge: (...a: unknown[]) => mockCancel(...a) }));

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
  let ok = false;
  await act(async () => {
    ok = await result.current.cancel("c1");
  });
  expect(ok).toBe(true);
  expect(mockCancel).toHaveBeenCalledWith(expect.anything(), "c1");
  expect(result.current.bookings).toEqual([]);
});

it("a failed cancel keeps the booking", async () => {
  mockPresence.mockResolvedValue({ ok: true, data: { ok: true, started: false, match_id: null, verdict: "waiting" } });
  mockCancel.mockResolvedValue({ ok: false, error: { message: "offline" } });
  const { result } = setup();
  await waitFor(() => expect(result.current.bookings).toHaveLength(1));
  let ok = true;
  await act(async () => {
    ok = await result.current.cancel("c1");
  });
  expect(ok).toBe(false);
  expect(result.current.bookings).toHaveLength(1);
});
