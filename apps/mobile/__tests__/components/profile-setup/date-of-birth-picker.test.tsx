/**
 * The date of birth picker's under-16 cutoff (maximumDate) follows the UTC
 * calendar date, like the claim RPC's age check, so the picker never allows
 * a date the server calls underage, and never blocks one it allows.
 *
 * Source: apps/mobile/components/profile-setup/date-of-birth-picker.tsx
 */
import * as React from "react";
import { Platform } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

const mockPickerProps: Array<Record<string, unknown>> = [];
const mockAndroidOpen = jest.fn();
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  const Picker = (props: Record<string, unknown>) => {
    mockPickerProps.push(props);
    return <View testID="native-dob-picker" />;
  };
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: (...a: unknown[]) => mockAndroidOpen(...a) } };
});
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({ card: "#111", cardForeground: "#eee" }) }));

import { DateOfBirthPicker } from "@/components/profile-setup/date-of-birth-picker";

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("DateOfBirthPicker maximumDate (16 years before the UTC date)", () => {
  const originalTz = process.env.TZ;
  const originalOs = Platform.OS;
  // A zone behind UTC: at 01:00 UTC on Oct 2 it is still Oct 1 locally, so a
  // cutoff built from the local date would be a day early.
  beforeAll(() => {
    process.env.TZ = "America/Toronto";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });
  beforeEach(() => {
    mockPickerProps.length = 0;
    mockAndroidOpen.mockReset();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-02T01:00:00Z"));
  });
  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(Platform, "OS", { value: originalOs, configurable: true });
  });

  it("iOS: the spinner's maximumDate is the 16th birthday on today's UTC date", () => {
    expect(new Date().getDate()).toBe(1); // the pin is in effect: local date is behind
    render(<DateOfBirthPicker value="" onChange={jest.fn()} />);
    fireEvent.press(screen.getByRole("button"));
    const props = mockPickerProps[mockPickerProps.length - 1];
    expect(ymdLocal(props.maximumDate as Date)).toBe("2010-10-02");
    // With no value, the spinner starts on the cutoff itself.
    expect(ymdLocal(props.value as Date)).toBe("2010-10-02");
  });

  it("Android: the dialog opens with the same UTC cutoff", () => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    render(<DateOfBirthPicker value="" onChange={jest.fn()} />);
    fireEvent.press(screen.getByRole("button"));
    expect(mockAndroidOpen).toHaveBeenCalledTimes(1);
    expect(ymdLocal(mockAndroidOpen.mock.calls[0][0].maximumDate)).toBe("2010-10-02");
  });

  it("shows the under-16 error for a date after the UTC cutoff, not for the cutoff itself", () => {
    const { rerender } = render(<DateOfBirthPicker value="2010-10-02" onChange={jest.fn()} />);
    expect(screen.queryByText("You must be at least 16 to compete.")).toBeNull();
    rerender(<DateOfBirthPicker value="2010-10-03" onChange={jest.fn()} />);
    expect(screen.getByText("You must be at least 16 to compete.")).toBeTruthy();
  });
});
