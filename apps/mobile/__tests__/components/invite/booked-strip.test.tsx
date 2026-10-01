/**
 * The Arena's Booked strip (contract 7 booking surface): the busy copy, the
 * three location states, the accuracy retry, and Cancel booking behind a
 * confirm.
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

it.each([
  ["inviter_busy", "Alex is mid-match. We'll hold your spot."],
  ["claimer_busy", "Finish your current match first. Your booking with Alex is saved."],
  [null, "You're booked. The match starts when you're both on the mat."],
] as const)("start blocked %s reads the named copy", (reason, copy) => {
  renderStrip({ presence: { blockedReason: reason, accuracyTooLow: false } });
  expect(screen.getByTestId("booked-message")).toHaveTextContent(copy);
});

it("never asked: Turn on location asks", () => {
  const h = renderStrip({ location: "ask" });
  fireEvent.press(screen.getByLabelText("Turn on location"));
  expect(h.onAskLocation).toHaveBeenCalled();
  expect(screen.queryByLabelText("Open Settings")).toBeNull();
});

it("denied: Open Settings", () => {
  renderStrip({ location: "denied" });
  expect(screen.getByLabelText("Open Settings")).toBeTruthy();
});

it("no fix in time: the copy and Try again", () => {
  const h = renderStrip({ location: "unavailable" });
  expect(screen.getByText("We couldn't get your location. Check your signal, then try again.")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Try again"));
  expect(h.onRetry).toHaveBeenCalled();
});

it("accuracy too low: the copy and Try again", () => {
  const h = renderStrip({ presence: { blockedReason: null, accuracyTooLow: true } });
  expect(screen.getByText(/We couldn't pin your location/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Try again"));
  expect(h.onRetry).toHaveBeenCalled();
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
