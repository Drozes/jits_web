/**
 * WP7 review (jits-3eeg.8): the splash statement's wordmark lost its
 * `text-[#E8EDF2]` / `text-[#FFFFFF]` classes, so its color now comes only
 * from the inline style (the dark tokens). Pin that the inline color is what
 * renders, so the splash cannot silently fall back to Wordmark's themed
 * `text-ink` (near-black in light mode, on the Void splash).
 */
import * as React from "react";
import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success" },
}));
jest.mock("expo-splash-screen", () => ({ hideAsync: jest.fn(() => Promise.resolve()) }));

import { SplashStatement } from "@/components/ui/elo-system/splash-statement";
import { Wordmark } from "@/components/ui/elo-system/wordmark";
import { darkTokens, onMediaTokens } from "@/lib/tokens";

describe("splash wordmark color", () => {
  it("Wordmark applies a caller's inline color last, over its own class", () => {
    const { getByText } = render(<Wordmark style={{ color: "#123456" }} />);
    expect(StyleSheet.flatten(getByText("ELO RATED").props.style).color).toBe("#123456");
  });

  it("the statement draws the base wordmark in terminal white and the halo in pure white", () => {
    jest.useFakeTimers();
    const { getAllByText, unmount } = render(<SplashStatement onDone={jest.fn()} />);
    const colors = getAllByText("ELO RATED").map(
      (node) => StyleSheet.flatten(node.props.style).color,
    );
    expect(colors).toEqual([darkTokens.textPrimary, onMediaTokens.white]);
    expect(darkTokens.textPrimary).toBe("#E8EDF2");
    unmount();
    jest.useRealTimers();
  });
});
