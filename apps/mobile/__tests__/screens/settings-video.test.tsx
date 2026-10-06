/**
 * Video settings: the playback quality choice (jits-xfvd.12, spec 05 5.7).
 */
import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "select-check" });
  return new Proxy({}, { get: (_t, p) => (p === "__esModule" ? true : stub) });
});
jest.mock("@/components/layout/app-header", () => {
  const R = require("react");
  const RN = require("react-native");
  return { AppHeader: ({ title }: { title: string }) => R.createElement(RN.Text, null, title) };
});
jest.mock("@/components/layout/page-container", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#fff" }),
  useResolvedColorScheme: () => "dark",
}));

import SettingsVideoScreen from "@/app/(app)/settings/video";
import {
  PLAYBACK_QUALITY_KEY,
  __resetPlaybackQualityPreferenceForTests,
  getPlaybackQualityPreference,
} from "@/lib/video/quality/preference";

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetPlaybackQualityPreferenceForTests("auto", false);
});

describe("Settings: video, playback quality", () => {
  it("renders the three options with the literal copy, as a radio group", async () => {
    const s = render(<SettingsVideoScreen />);
    await act(async () => undefined);
    expect(s.getByText("Video Settings")).toBeTruthy();
    expect(s.getByText("PLAYBACK QUALITY")).toBeTruthy();
    expect(s.getByText("Auto")).toBeTruthy();
    expect(s.getByText("Best quality your connection can hold. Switches to a lighter version if the video stalls.")).toBeTruthy();
    expect(s.getByText("High")).toBeTruthy();
    expect(s.getByText("Always the 720p version. Uses more data.")).toBeTruthy();
    expect(s.getByText("Data saver")).toBeTruthy();
    expect(s.getByText("Always the 360p version. Uses about a quarter of the data.")).toBeTruthy();
    expect(
      s.getByText(
        "Applies to match films on this phone. Highlight reels are not affected. If a version is still processing, the closest one that is ready plays.",
      ),
    ).toBeTruthy();
    // The recording lede stays below, unchanged.
    expect(s.getByText(/Video recording settings will be available here/)).toBeTruthy();
    const group = s.UNSAFE_getByProps({ accessibilityRole: "radiogroup" });
    expect(group.props.accessibilityLabel).toBe("Playback quality");
    const radios = s.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual(["Auto", "High", "Data saver"]);
    expect(radios[2].props.accessibilityHint).toBe("Always the 360p version. Uses about a quarter of the data.");
  });

  it("Auto is selected by default, with one check", async () => {
    const s = render(<SettingsVideoScreen />);
    await act(async () => undefined);
    const radios = s.getAllByRole("radio");
    expect(radios.map((r) => r.props.accessibilityState.selected)).toEqual([true, false, false]);
    expect(s.getAllByTestId("select-check", { includeHiddenElements: true })).toHaveLength(1);
  });

  it("shows the stored choice once it hydrates", async () => {
    await AsyncStorage.setItem(PLAYBACK_QUALITY_KEY, "data_saver");
    const s = render(<SettingsVideoScreen />);
    await act(async () => undefined);
    expect(s.getAllByRole("radio").map((r) => r.props.accessibilityState.selected)).toEqual([false, false, true]);
  });

  it("saves immediately on press", async () => {
    const s = render(<SettingsVideoScreen />);
    await act(async () => undefined);
    fireEvent.press(s.getByTestId("playback-quality-high"));
    expect(getPlaybackQualityPreference()).toBe("high");
    expect(s.getAllByRole("radio").map((r) => r.props.accessibilityState.selected)).toEqual([false, true, false]);
    await act(async () => undefined);
    expect(await AsyncStorage.getItem(PLAYBACK_QUALITY_KEY)).toBe("high");
  });

  it("uses the selection surface, never Signal Red", async () => {
    const s = render(<SettingsVideoScreen />);
    await act(async () => undefined);
    for (const radio of s.getAllByRole("radio")) {
      const cls = String(radio.props.className ?? "");
      expect(cls).not.toMatch(/primary|accent|red/);
    }
  });
});
