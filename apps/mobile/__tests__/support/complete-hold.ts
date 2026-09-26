/**
 * Drives the live screen's hold-to-end button through a completed hold:
 * finger down, the 1.2 s long press fires, finger up. The long press is what
 * ends the match; the fill animation is only a readout.
 */
import { fireEvent } from "@testing-library/react-native";

type Element = Parameters<typeof fireEvent>[0];

export function completeHold(button: Element): void {
  fireEvent(button, "pressIn");
  fireEvent(button, "longPress");
  fireEvent(button, "pressOut");
}
