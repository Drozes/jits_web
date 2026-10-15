/**
 * The Go Live "precise" sheet picks its Settings path by platform
 * (jits-mafl.2 M4): iOS keeps "Precise Location"; Android names the switch
 * "Use precise location" under Apps > Permissions.
 *
 * Source: apps/mobile/components/arena/go-live-location-sheet.tsx
 */
import * as React from "react";
import { Platform } from "react-native";
import { render, screen } from "@testing-library/react-native";
import {
  PRECISE_LOCATION_COPY,
  PRECISE_LOCATION_COPY_ANDROID,
  PRECISE_LOCATION_TITLE,
  PRECISE_LOCATION_TITLE_ANDROID,
} from "@jits/shared/utils";

let mockState: { phase: string; busy: boolean; purpose: "go_live" | "arena" } | null = null;
jest.mock("@/lib/arena/go-live-location", () => ({
  useGoLiveLocationSheet: () => mockState,
  answerGoLiveLocation: jest.fn(),
}));

import { GoLiveLocationSheet } from "@/components/arena/go-live-location-sheet";

const ORIGINAL_OS = Platform.OS;
function setOS(os: "ios" | "android") {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

afterEach(() => {
  setOS(ORIGINAL_OS as "ios" | "android");
  mockState = null;
});

describe("precise sheet copy by platform", () => {
  it("iOS keeps the Precise Location path", () => {
    setOS("ios");
    mockState = { phase: "precise", busy: false, purpose: "go_live" };
    render(<GoLiveLocationSheet />);
    expect(screen.getByText(PRECISE_LOCATION_TITLE)).toBeTruthy();
    expect(screen.getByTestId("go-live-location-body")).toHaveTextContent(PRECISE_LOCATION_COPY);
  });

  it("Android shows the Use precise location path", () => {
    setOS("android");
    mockState = { phase: "precise", busy: false, purpose: "go_live" };
    render(<GoLiveLocationSheet />);
    expect(screen.getByText(PRECISE_LOCATION_TITLE_ANDROID)).toBeTruthy();
    expect(screen.getByTestId("go-live-location-body")).toHaveTextContent(PRECISE_LOCATION_COPY_ANDROID);
    expect(screen.queryByText(PRECISE_LOCATION_TITLE)).toBeNull();
  });

  it("other phases are unchanged on Android (arena explain keeps its title)", () => {
    setOS("android");
    mockState = { phase: "explain", busy: false, purpose: "arena" };
    render(<GoLiveLocationSheet />);
    expect(screen.getByText("Location to start")).toBeTruthy();
  });
});
