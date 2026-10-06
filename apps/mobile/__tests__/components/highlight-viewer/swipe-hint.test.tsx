/** C-V1 and its Motion registry row "Swipe hint" (spec 8.4): the chevron lifts twice, never under Reduce Motion. */
import * as React from "react";
import { render } from "@testing-library/react-native";

const mockWithRepeat = jest.fn((v: unknown, _times?: number) => v);
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return { __esModule: true, ...actual, default: actual.default, withRepeat: (...a: unknown[]) => mockWithRepeat(...(a as [unknown, number])) };
});
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: unknown, p: string) => (p === "__esModule" ? true : stub) });
});

import { SwipeHint } from "@/components/highlight-viewer/swipe-hint";
import { __setReduceMotionForTests } from "@/lib/motion";

afterEach(() => {
  __setReduceMotionForTests(false);
  mockWithRepeat.mockClear();
});

it("reads C-V1 and lifts the chevron twice", () => {
  const utils = render(<SwipeHint />);
  expect(utils.getByTestId("swipe-hint")).toHaveTextContent("Swipe up for the next one");
  expect(mockWithRepeat).toHaveBeenCalledTimes(1);
  expect(mockWithRepeat.mock.calls[0][1]).toBe(2);
});

it("Reduce Motion: a still hint, no bounce", () => {
  __setReduceMotionForTests(true);
  const utils = render(<SwipeHint />);
  expect(utils.getByText("Swipe up for the next one")).toBeTruthy();
  expect(mockWithRepeat).not.toHaveBeenCalled();
});
