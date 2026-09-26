/**
 * Drives the live screen's hold-to-end button through a completed hold:
 * finger down, the 1.2 s long press fires, finger up. The button's own hold
 * timer is the primary trigger; the long press is a redundant one that lets
 * tests complete a hold without advancing timers.
 */
import { fireEvent } from "@testing-library/react-native";

type Element = Parameters<typeof fireEvent>[0];

export function completeHold(button: Element): void {
  fireEvent(button, "pressIn");
  fireEvent(button, "longPress");
  fireEvent(button, "pressOut");
}
