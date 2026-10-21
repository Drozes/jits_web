/**
 * The athletes' offline banner (TK-D7) and the live screen's timekeeper-mode
 * banner slot (slice M4, TEST-PLAN 3.2): `{NAME} IS OFFLINE` on the dark
 * plate in the attention token, with the TK-D9 countdown at its right (and
 * without one before the start, where the face-off mounts it); TK-D9 alone
 * while paused; the timekeeper's camera banner (TK-L3, TK-L4), announced once
 * on iOS.
 *
 * The TK-D9 chip itself is M3's (`faceoff/timeout-chip.tsx`); the live
 * screen renders it read-only through `renderTimeoutChip`, so here a stand-in
 * that prints `NO CONTEST IN {m:ss}` from the instant it is handed proves the
 * placement and the instant, and the deck string (TK-D9).
 */
import * as React from "react";
import { AccessibilityInfo, Platform, Text } from "react-native";
import { fireEvent, render, within } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) });
});
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2", textOnAccent: "#0D0F14", accentCta: "#E63946" }),
  useResolvedColorScheme: () => "dark",
}));

import { TimekeeperOfflineBanner } from "@/components/match-flow/live/timekeeper-offline-banner";
import { TimekeeperLiveBanners } from "@/components/match-flow/live/timekeeper-live-plates";
import { TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import { BROADCAST } from "@/components/match-flow/live/broadcast-tokens";

const NOW = Date.parse("2026-10-20T12:00:00.000Z");
const IN_8_47 = new Date(NOW + (8 * 60 + 47) * 1000).toISOString();

/** A stand-in for M3's TK-D9 chip: the deck's words for the seconds left at the instant. */
const chip = (timeoutAt: string) => (
  <Text testID="tk-d9">{TIMEKEEPER_COPY["TK-D9"].text((Date.parse(timeoutAt) - NOW) / 1000)}</Text>
);

describe("TimekeeperOfflineBanner (TK-D7)", () => {
  it("names the timekeeper upper-cased, in the attention amber on the live screen's dark plate", () => {
    const s = render(<TimekeeperOfflineBanner name="J. Cruz" />);
    const text = s.getByText("J. CRUZ IS OFFLINE");
    expect(text).toHaveStyle({ color: BROADCAST.amber });
    const banner = s.getByTestId("live-timekeeper-offline");
    expect(banner).toHaveStyle({ borderColor: BROADCAST.amber, borderStyle: "dashed", backgroundColor: BROADCAST.slab });
    expect(banner.props.accessibilityRole).toBe("alert");
  });

  it("carries the TK-D9 countdown at its right when given one", () => {
    const s = render(<TimekeeperOfflineBanner name="J. Cruz" chip={chip(IN_8_47)} />);
    s.getByText("J. CRUZ IS OFFLINE");
    s.getByText("NO CONTEST IN 8:47");
  });

  it("has no chip of its own before the start (the face-off's chip already counts down)", () => {
    const s = render(<TimekeeperOfflineBanner name="J. Cruz" />);
    expect(s.queryByText(/NO CONTEST IN/)).toBeNull();
  });

  it("a blank name prints the role, never an empty line (the face-off mount passes the seam's short name as is)", () => {
    const s = render(<TimekeeperOfflineBanner name=" " />);
    s.getByText("TIMEKEEPER IS OFFLINE");
  });

  it("is announced once on iOS when it appears", () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
    // The preset's AccessibilityInfo is already a mock: forget the earlier tests' calls.
    announce.mockClear();
    const s = render(<TimekeeperOfflineBanner name="J. Cruz" />);
    s.rerender(<TimekeeperOfflineBanner name="J. Cruz" chip={chip(IN_8_47)} />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("J. CRUZ IS OFFLINE");
    announce.mockRestore();
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  });
});

describe("TimekeeperLiveBanners (the slot above the athlete bar)", () => {
  it("offline: TK-D7 with TK-D9 counting to the no-contest instant inside it", () => {
    const s = render(
      <TimekeeperLiveBanners offlineName="J. Cruz" timeoutAt={IN_8_47} renderTimeoutChip={chip} onRestartCamera={null} />,
    );
    const banner = s.getByTestId("live-timekeeper-offline");
    expect(s.getByTestId("tk-d9")).toHaveTextContent("NO CONTEST IN 8:47");
    // The chip is the banner's own, not a second one next to it.
    expect(s.getAllByTestId("tk-d9")).toHaveLength(1);
    within(banner).getByText("NO CONTEST IN 8:47");
  });

  it("paused and online: TK-D9 alone, counting to the pause timeout", () => {
    const s = render(
      <TimekeeperLiveBanners offlineName={null} timeoutAt={IN_8_47} renderTimeoutChip={chip} onRestartCamera={null} />,
    );
    expect(s.queryByTestId("live-timekeeper-offline")).toBeNull();
    s.getByText("NO CONTEST IN 8:47");
  });

  it("offline with no countdown handed in: TK-D7 alone", () => {
    const s = render(<TimekeeperLiveBanners offlineName="J. Cruz" timeoutAt={null} renderTimeoutChip={chip} onRestartCamera={null} />);
    s.getByText("J. CRUZ IS OFFLINE");
    expect(s.queryByTestId("tk-d9")).toBeNull();
  });

  it("draws no countdown while no chip renderer is passed (M3's chip not wired yet)", () => {
    const s = render(<TimekeeperLiveBanners offlineName={null} timeoutAt={IN_8_47} onRestartCamera={null} />);
    expect(s.toJSON()).toBeNull();
  });

  it("the camera banner (TK-L3) is announced once on iOS when it appears", () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
    announce.mockClear();
    const restart = jest.fn();
    const s = render(<TimekeeperLiveBanners offlineName={null} timeoutAt={null} onRestartCamera={restart} />);
    s.rerender(<TimekeeperLiveBanners offlineName={null} timeoutAt={IN_8_47} renderTimeoutChip={chip} onRestartCamera={restart} />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("CAMERA STOPPED · KEEP RUNNING THE CLOCK");
    announce.mockRestore();
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  });

  it("the timekeeper's camera failed: TK-L3 with Restart camera (TK-L4)", () => {
    const restart = jest.fn();
    const s = render(<TimekeeperLiveBanners offlineName={null} timeoutAt={null} onRestartCamera={restart} />);
    s.getByText("CAMERA STOPPED · KEEP RUNNING THE CLOCK");
    const button = s.getByTestId("live-camera-restart");
    expect(button.props.accessibilityLabel).toBe("Restart camera");
    s.getByText("RESTART CAMERA");
    fireEvent.press(button);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("nothing to show: renders nothing", () => {
    const s = render(<TimekeeperLiveBanners offlineName={null} timeoutAt={null} renderTimeoutChip={chip} onRestartCamera={null} />);
    expect(s.toJSON()).toBeNull();
  });
});
