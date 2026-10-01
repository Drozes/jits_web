/**
 * PasteInviteButton: forwards pasted text, ignores images and blank text,
 * and renders nothing where UIPasteControl is unavailable.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

const mockClipboard = { isPasteButtonAvailable: true, lastProps: null as null | Record<string, unknown> };
jest.mock("expo-clipboard", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    get isPasteButtonAvailable() {
      return mockClipboard.isPasteButtonAvailable;
    },
    ClipboardPasteButton: (props: Record<string, unknown>) => {
      mockClipboard.lastProps = props;
      return R.createElement(RN.View, { testID: "system-paste" });
    },
  };
});

import { PasteInviteButton } from "@/components/invite/PasteInviteButton";

type Press = (d: unknown) => void;

beforeEach(() => {
  mockClipboard.isPasteButtonAvailable = true;
  mockClipboard.lastProps = null;
});

it("forwards pasted text", () => {
  const onPasteText = jest.fn();
  const s = render(<PasteInviteButton onPasteText={onPasteText} />);
  expect(s.getByTestId("system-paste")).toBeTruthy();
  expect(s.getByText("Copied a challenge link? Paste it here.")).toBeTruthy();
  (mockClipboard.lastProps!.onPress as Press)({ type: "text", text: "https://elorated.com/c/abc" });
  expect(onPasteText).toHaveBeenCalledWith("https://elorated.com/c/abc");
  expect(mockClipboard.lastProps!.acceptedContentTypes).toEqual(["plain-text"]);
});

it("ignores images and blank text", () => {
  const onPasteText = jest.fn();
  render(<PasteInviteButton onPasteText={onPasteText} />);
  const press = mockClipboard.lastProps!.onPress as Press;
  press({ type: "image", data: "x", size: { width: 1, height: 1 } });
  press({ type: "text", text: "   " });
  expect(onPasteText).not.toHaveBeenCalled();
});

it("renders nothing where the paste control is unavailable", () => {
  mockClipboard.isPasteButtonAvailable = false;
  const s = render(<PasteInviteButton onPasteText={jest.fn()} />);
  expect(s.queryByTestId("paste-invite")).toBeNull();
});
