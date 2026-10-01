/**
 * The Arena's Booked strip (contract 7 booking surface): the busy copy, the
 * three location states, the accuracy retry, and Cancel booking behind a
 * confirm. The strip shows short copy that fits at 375pt and keeps the full
 * copy as the status line's accessibilityLabel; a location fix wins over the
 * busy line.
 *
 * Source: apps/mobile/components/invite/booked-strip.tsx
 */
import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { BookedStrip } from "@/components/invite/booked-strip";
import type { Booking } from "@jits/shared/api/invites";

const booking = {
  challenge_id: "c1",
  opponent: { athlete_id: "a1", display_name: "Alex R", first_name: "Alex" },
} as unknown as Booking;

function renderStrip(
  props: Partial<React.ComponentProps<typeof BookedStrip>> = {},
  result: "cancelled" | "too_late" | "failed" = "cancelled",
) {
  const handlers = { onRetry: jest.fn(), onAskLocation: jest.fn(), onCancel: jest.fn(() => Promise.resolve(result)) };
  render(<BookedStrip booking={booking} location="ok" presence={undefined} {...handlers} {...props} />);
  return handlers;
}

beforeEach(() => jest.restoreAllMocks());

const status = () => screen.getByTestId("booked-message");

it.each([
  ["inviter_busy", "Alex is mid-match. We'll hold your spot.", "Alex is mid-match. We'll hold your spot."],
  ["claimer_busy", "Finish your match first.", "Finish your current match first. Your booking with Alex is saved."],
  [null, "Starts when you're both on the mat.", "You're booked. The match starts when you're both on the mat."],
] as const)("start blocked %s shows the short line, full copy for VoiceOver", (reason, short, full) => {
  renderStrip({ presence: { blockedReason: reason, accuracyTooLow: false } });
  expect(status()).toHaveTextContent(short);
  expect(status().props.accessibilityLabel).toBe(full);
  expect(screen.queryByLabelText("Try again")).toBeNull();
});

it("never asked: the short copy and Enable, which asks", () => {
  const h = renderStrip({ location: "ask" });
  expect(status()).toHaveTextContent("Location off. Needed to start.");
  expect(status().props.accessibilityLabel).toBe(
    "Location is off. ELO RATED checks you're both on the same mat before a match starts.",
  );
  expect(screen.getByText("Enable")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Turn on location"));
  expect(h.onAskLocation).toHaveBeenCalled();
  expect(screen.queryByLabelText("Open Settings")).toBeNull();
});

it("denied: the short copy and Settings", () => {
  renderStrip({ location: "denied" });
  expect(status()).toHaveTextContent("Location off. Needed to start.");
  expect(status().props.accessibilityLabel).toBe(
    "Location is off. ELO RATED checks you're both on the same mat before a match starts.",
  );
  expect(screen.getByText("Settings")).toBeTruthy();
  expect(screen.getByLabelText("Open Settings")).toBeTruthy();
});

it("no fix in time: the short copy and Retry", () => {
  const h = renderStrip({ location: "unavailable" });
  expect(status()).toHaveTextContent("No location signal. Try again.");
  expect(status().props.accessibilityLabel).toBe(
    "We couldn't get your location. Check your signal, then try again.",
  );
  expect(screen.getByText("Retry")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Try again"));
  expect(h.onRetry).toHaveBeenCalled();
});

it("accuracy too low: the short copy and Retry", () => {
  const h = renderStrip({ presence: { blockedReason: null, accuracyTooLow: true } });
  expect(status()).toHaveTextContent("Can't pin your location. Try near a window.");
  expect(status().props.accessibilityLabel).toBe(
    "We couldn't pin your location. Move near a window or turn on Wi-Fi, then try again.",
  );
  expect(screen.getByText("Retry")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Try again"));
  expect(h.onRetry).toHaveBeenCalled();
});

it("implausible movement: its copy and the athlete's own Retry", () => {
  const h = renderStrip({ presence: { blockedReason: null, accuracyTooLow: false, implausibleMovement: true } });
  expect(status()).toHaveTextContent("Can't pin your location. Try again.");
  fireEvent.press(screen.getByLabelText("Try again"));
  expect(h.onRetry).toHaveBeenCalledTimes(1);
});

it("a booking_closed reason shows the closed-booking copy", () => {
  renderStrip({ presence: { blockedReason: "booking_closed", accuracyTooLow: false } });
  expect(status()).toHaveTextContent("This booking was cancelled.");
});

it.each([
  ["denied", false, "Location off. Needed to start."],
  ["unavailable", false, "No location signal. Try again."],
  ["ok", true, "Can't pin your location. Try near a window."],
] as const)("a location fix (%s) takes precedence over a busy line", (location, accuracyTooLow, short) => {
  renderStrip({ location, presence: { blockedReason: "inviter_busy", accuracyTooLow } });
  expect(status()).toHaveTextContent(short);
  expect(status()).not.toHaveTextContent(/mid-match/);
  expect(status().props.accessibilityLabel).not.toMatch(/mid-match/);
});

it("Cancel booking confirms first", async () => {
  const alert = jest.spyOn(Alert, "alert");
  const h = renderStrip();
  fireEvent.press(screen.getByLabelText("Cancel booking"));
  expect(h.onCancel).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
  await act(async () => {
    await buttons.find((b) => b.text === "Cancel booking")?.onPress?.();
  });
  expect(h.onCancel).toHaveBeenCalled();
});

it.each([
  ["failed", true],
  ["too_late", false],
  ["cancelled", false],
] as const)("a %s cancel shows the connection alert: %s", async (result, shown) => {
  const alert = jest.spyOn(Alert, "alert");
  renderStrip({}, result);
  fireEvent.press(screen.getByLabelText("Cancel booking"));
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
  await act(async () => {
    await buttons.find((b) => b.text === "Cancel booking")?.onPress?.();
  });
  const titles = alert.mock.calls.map((c) => c[0]);
  expect(titles.includes("Couldn't cancel")).toBe(shown);
});

it("sits on the shared strip shell at the challenge strips' size", () => {
  renderStrip({ presence: { blockedReason: null, accuracyTooLow: false } });
  const strip = screen.getByTestId("arena-booked-c1");
  expect(String(strip.props.className)).toMatch(/min-h-\[48px\]/);
  expect(screen.getByText("Booked · Alex")).toBeTruthy();
  // Status is one short line at strip size, never a block of body copy.
  expect(screen.getByTestId("booked-message").props.numberOfLines).toBe(2);
  expect(String(screen.getByTestId("booked-message").props.className)).toMatch(/text-\[11px\]/);
});

describe("match_location_required off: Start match", () => {
  it("offers Start match (outline, not red) with the start copy and no location fix", () => {
    const onStart = jest.fn();
    // A denied location must not matter: nothing is read with the flag off.
    renderStrip({ locationRequired: false, onStart, location: "denied" });
    expect(status()).toHaveTextContent("Tap Start when you're both on the mat.");
    expect(status().props.accessibilityLabel).toBe("You're booked. Tap Start match when you're both on the mat.");
    expect(screen.queryByLabelText("Open Settings")).toBeNull();
    expect(screen.queryByLabelText("Try again")).toBeNull();
    const start = screen.getByTestId("arena-booked-start-c1");
    expect(start.props.accessibilityLabel).toBe("Start match with Alex");
    expect(String(start.props.className)).toMatch(/border/);
    expect(String(start.props.className)).not.toMatch(/bg-cta/);
    fireEvent.press(start);
    expect(onStart).toHaveBeenCalled();
    // Cancel stays.
    expect(screen.getByLabelText("Cancel booking")).toBeTruthy();
  });

  it("disables Start match while a start is in flight", () => {
    const onStart = jest.fn();
    renderStrip({ locationRequired: false, onStart, starting: true });
    const start = screen.getByTestId("arena-booked-start-c1");
    expect(start.props.accessibilityState).toEqual({ disabled: true });
    expect(screen.getByText("Starting")).toBeTruthy();
  });

  it("a refused start shows its short line, the full copy for VoiceOver, as an alert", () => {
    renderStrip({
      locationRequired: false,
      onStart: jest.fn(),
      startError: { short: "Alex is mid-match. We'll hold your spot.", full: "Alex is mid-match. We'll hold your spot." },
    });
    expect(status()).toHaveTextContent("Alex is mid-match. We'll hold your spot.");
    expect(status().props.accessibilityRole).toBe("alert");
  });

  it("flag on: no Start match, the location flow as before", () => {
    renderStrip({ locationRequired: true, onStart: jest.fn(), location: "denied" });
    expect(screen.queryByTestId("arena-booked-start-c1")).toBeNull();
    expect(screen.getByLabelText("Open Settings")).toBeTruthy();
  });
});
