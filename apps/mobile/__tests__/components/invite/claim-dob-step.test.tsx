/**
 * The dob_required step's own check before saving (jr_be spec 016, contract
 * 7): an under-16 date on the UTC calendar date shows the underage copy
 * inline and never saves or claims; the 16th birthday on the UTC date saves.
 *
 * Source: apps/mobile/components/invite/claim-dob-step.tsx
 */
import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

let mockPick = "2010-10-03";
// The native picker cannot be driven in Jest: a press picks `mockPick`.
jest.mock("@/components/profile-setup/date-of-birth-picker", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    DateOfBirthPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
      <Pressable testID="dob-picker" onPress={() => onChange(mockPick)}>
        <Text>{value || "Select your date of birth"}</Text>
      </Pressable>
    ),
  };
});
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({ textSecondary: "#999" }) }));

import { ClaimDobStep } from "@/components/invite/claim-dob-step";

describe("ClaimDobStep underage branch (the UTC date, local zone behind UTC)", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Toronto";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });
  beforeEach(() => {
    jest.useFakeTimers();
    // 01:00 UTC on Oct 2: the server's date is Oct 2, still Oct 1 locally.
    jest.setSystemTime(new Date("2026-10-02T01:00:00Z"));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("an under-16 date shows the underage copy inline and never saves", () => {
    mockPick = "2010-10-03";
    const onSubmit = jest.fn();
    render(<ClaimDobStep message="We need your date of birth." error={null} onSubmit={onSubmit} onNotNow={jest.fn()} />);
    fireEvent.press(screen.getByTestId("dob-picker"));
    fireEvent.press(screen.getByTestId("claim-dob-save"));
    expect(screen.getByTestId("claim-dob-error")).toHaveTextContent("You must be 16 or older to compete on ELO RATED.");
    expect(onSubmit).not.toHaveBeenCalled();
    // Picking again clears the inline error.
    fireEvent.press(screen.getByTestId("dob-picker"));
    expect(screen.queryByTestId("claim-dob-error")).toBeNull();
  });

  it("the 16th birthday on the UTC date (a day ahead of the local date) saves", () => {
    mockPick = "2010-10-02";
    const onSubmit = jest.fn();
    render(<ClaimDobStep message="We need your date of birth." error={null} onSubmit={onSubmit} onNotNow={jest.fn()} />);
    fireEvent.press(screen.getByTestId("dob-picker"));
    fireEvent.press(screen.getByTestId("claim-dob-save"));
    expect(screen.queryByTestId("claim-dob-error")).toBeNull();
    expect(onSubmit).toHaveBeenCalledWith("2010-10-02");
  });
});
