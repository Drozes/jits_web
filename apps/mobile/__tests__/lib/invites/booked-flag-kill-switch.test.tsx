/**
 * The `match_location_required` kill switch reaching a running client (M1)
 * and the cold-start flash (L4), at the consumer: the real flag module, the
 * real `useBookings` and the real Booked strip, wired exactly as the Arena
 * screen wires them.
 *
 * - The owner turns the flag OFF mid-session: the next booking reading comes
 *   back `start_blocked_reason: 'start_available'` (only a flag-off server
 *   says that), and the strip must switch to Start match at once instead of
 *   saying "Tap Start..." with no Start button.
 * - On a cold start, before the flag is known, the strip shows neither
 *   Start match nor a location fix.
 *
 * Source: apps/mobile/lib/arena/match-location-flag.ts,
 * apps/mobile/lib/invites/use-bookings.ts,
 * apps/mobile/components/invite/booked-strip.tsx
 */
import * as React from "react";
import { AppState } from "react-native";
import { render, screen, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockReading = jest.fn();
jest.mock("@/lib/invites/location", () => ({ readLocationOnce: (...a: unknown[]) => mockReading(...a) }));
const mockBookings = jest.fn();
const mockPresence = jest.fn();
jest.mock("@jits/shared/api/invites", () => ({
  getMyBookings: (...a: unknown[]) => mockBookings(...a),
  reportMatchPresence: (...a: unknown[]) => mockPresence(...a),
}));
jest.mock("@/lib/invites/pending-invite", () => ({ releasePushDeferral: () => Promise.resolve() }));
jest.mock("@jits/shared/api/mutations", () => ({ cancelChallenge: jest.fn() }));
const mockGetFlag = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  getMatchLocationRequired: (...a: unknown[]) => mockGetFlag(...a),
  startInviteBooking: jest.fn(),
  subscribeToChallengeStatus: () => () => undefined,
}));

import { BookedStrip } from "@/components/invite/booked-strip";
import { resetMatchLocationRequired, useMatchLocationFlag } from "@/lib/arena/match-location-flag";
import { useBookings } from "@/lib/invites/use-bookings";

const BOOKING = {
  challenge_id: "c1",
  invite_id: "i-c1",
  role: "invitee",
  opponent: { athlete_id: "a1", display_name: "Alex R", first_name: "Alex" },
};
const READING = { status: "ok", reading: { lat: 1, lng: 2, accuracyM: 10 } };

/** The Arena screen's wiring of the strip (app/(app)/(tabs)/arena/index.tsx). */
function ArenaBookings() {
  const { required, known } = useMatchLocationFlag();
  const booked = useBookings({
    visible: true,
    locationRequired: known ? required : null,
    onStarted: () => undefined,
    onClosed: () => undefined,
  });
  return (
    <>
      {booked.bookings.map((b) => (
        <BookedStrip
          key={b.challenge_id}
          booking={b}
          location={booked.location}
          presence={booked.presence[b.challenge_id]}
          onRetry={() => undefined}
          onAskLocation={() => undefined}
          onCancel={() => Promise.resolve("cancelled")}
          locationRequired={required}
          flagKnown={known}
          onStart={() => undefined}
        />
      ))}
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetMatchLocationRequired();
  jest.spyOn(AppState, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as never);
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
  mockBookings.mockResolvedValue({ ok: true, data: [BOOKING] });
  mockReading.mockResolvedValue(READING);
});

it("M1: a start_available reply (flag turned off mid-session) brings up Start match at once", async () => {
  // The client read the flag ON earlier in the session.
  mockGetFlag.mockResolvedValue({ ok: true, data: true });
  // The owner has since turned it off: the server books with start_available.
  mockPresence.mockResolvedValue({
    ok: true,
    data: { ok: true, verdict: "recorded", started: false, match_id: null, start_blocked_reason: "start_available" },
  });
  render(<ArenaBookings />);
  await waitFor(() => expect(screen.getByTestId("arena-booked-start-c1")).toBeTruthy());
  expect(screen.getByTestId("booked-message")).toHaveTextContent("Tap Start when you're both on the mat.");
  // No flag re-read was needed: the reply itself turned it off.
  expect(mockGetFlag).toHaveBeenCalledTimes(1);
});

it("L4: before the flag is known the strip shows neither Start match nor a location fix", async () => {
  // A cold start: the flag read is still in flight.
  mockGetFlag.mockReturnValue(new Promise(() => undefined));
  render(<ArenaBookings />);
  await waitFor(() => expect(screen.getByTestId("arena-booked-c1")).toBeTruthy());
  expect(screen.queryByTestId("arena-booked-start-c1")).toBeNull();
  expect(screen.queryByText("Enable")).toBeNull();
  expect(screen.getByTestId("booked-message")).toHaveTextContent("Starts when you're both on the mat.");
  // And no location was read on an unknown flag.
  expect(mockReading).not.toHaveBeenCalled();
});

it("L4: a flag known OFF shows Start match; a failed read (unknown, treated off) shows it too", async () => {
  mockGetFlag.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  render(<ArenaBookings />);
  await waitFor(() => expect(screen.getByTestId("arena-booked-start-c1")).toBeTruthy());
  expect(mockReading).not.toHaveBeenCalled();
});
