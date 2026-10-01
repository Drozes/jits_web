/**
 * jits-02vo.5 (boards P-Setup-Who / P-Setup-Where): weight moves to "Who Are
 * You" with an optional athlete Instagram; "Where You Train" gains an optional
 * Gym Instagram between Home Gym and City, hidden for free agents and
 * read-only when the gym already has a handle the athlete cannot change.
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: unknown, p: string) => (p === "__esModule" ? true : stub) });
});
jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "light",
  useThemedTokens: () => ({ textTertiary: "#999", textSecondary: "#666" }),
}));
jest.mock("@/components/ui/native-select", () => {
  const R = require("react");
  const RN = require("react-native");
  return { NativeSelect: () => R.createElement(RN.View, { testID: "gym-select" }) };
});
jest.mock("@/components/profile-setup/city-autocomplete", () => {
  const R = require("react");
  const RN = require("react-native");
  return { CityAutocomplete: () => R.createElement(RN.View, { testID: "city" }) };
});
jest.mock("@/components/profile-setup/date-of-birth-picker", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    DateOfBirthPicker: () =>
      R.createElement(RN.Text, null, "Date of Birth"),
  };
});

import { IdentityStep } from "@/components/profile-setup/identity-step";
import { TrainingStep } from "@/components/profile-setup/training-step";
import { FREE_AGENT_OPTION, type WizardValues } from "@/components/profile-setup/types";
import { INSTAGRAM_HANDLE_ERROR } from "@/lib/profile-setup/validation";
import type { GymInstagramField } from "@/lib/profile-setup/gym-instagram";

const VALUES: WizardValues = {
  firstName: "Marcus",
  lastName: "Reyes",
  weight: "170",
  gymId: "g1",
  gender: "M",
  dateOfBirth: "1996-03-14",
  city: "Austin",
  instagram: "",
  gymInstagram: "",
};

const LABELS = /^(First Name|Last Name|Gender|Date of Birth|Weight \(lbs\)|Instagram|Home Gym|Gym Instagram|City)$/;

function labelOrder(utils: ReturnType<typeof render>) {
  return utils.getAllByText(LABELS).map((n) => n.props.children as string);
}

const editable: GymInstagramField = { visible: true, readOnly: false, storedHandle: null, canManage: false };

function renderTraining(values: Partial<WizardValues>, gymInstagram: GymInstagramField = editable) {
  return render(
    <TrainingStep
      values={{ ...VALUES, ...values }}
      onChange={jest.fn()}
      onSubmit={jest.fn()}
      loading={false}
      isEditing={false}
      gyms={[{ id: "g1", name: "Atos", city: "Austin", instagram_handle: null }]}
      cities={["Austin"]}
      gymInstagram={gymInstagram}
    />,
  );
}

describe("IdentityStep", () => {
  it("orders First, Last, Gender, DOB, Weight, Instagram with the board copy", () => {
    const utils = render(<IdentityStep values={VALUES} onChange={jest.fn()} onNext={jest.fn()} />);
    expect(labelOrder(utils)).toEqual([
      "First Name",
      "Last Name",
      "Gender",
      "Date of Birth",
      "Weight (lbs)",
      "Instagram",
    ]);
    expect(utils.getByText("Used for weight class matching.")).toBeTruthy();
    expect(utils.getByText("Optional.")).toBeTruthy();
    expect(utils.queryByText(/Shown on your profile/)).toBeNull();
    expect(utils.getByPlaceholderText("@yourhandle")).toBeTruthy();
  });

  it("shows an inline error for a malformed handle and blocks Continue", () => {
    const onNext = jest.fn();
    const utils = render(
      <IdentityStep values={{ ...VALUES, instagram: "bad handle" }} onChange={jest.fn()} onNext={onNext} />,
    );
    expect(utils.getByText(INSTAGRAM_HANDLE_ERROR)).toBeTruthy();
    fireEvent.press(utils.getByText("Continue"));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("forwards typed handles", () => {
    const onChange = jest.fn();
    const utils = render(<IdentityStep values={VALUES} onChange={onChange} onNext={jest.fn()} />);
    fireEvent.changeText(utils.getByTestId("setup-instagram"), "@marcus");
    expect(onChange).toHaveBeenCalledWith({ instagram: "@marcus" });
  });
});

describe("TrainingStep", () => {
  it("orders Home Gym, Gym Instagram, City and no longer asks for weight", () => {
    const utils = renderTraining({});
    expect(labelOrder(utils)).toEqual(["Home Gym", "Gym Instagram", "City"]);
    expect(utils.getByPlaceholderText("@gymhandle")).toBeTruthy();
    expect(utils.getByText("Optional.")).toBeTruthy();
    expect(utils.queryByText(/shared highlights/)).toBeNull();
  });

  it("hides Gym Instagram for a free agent", () => {
    const hidden = { visible: false, readOnly: false, storedHandle: null, canManage: false };
    const utils = renderTraining({ gymId: FREE_AGENT_OPTION }, hidden);
    expect(utils.queryByText("Gym Instagram")).toBeNull();
  });

  it("shows an existing handle read-only to a non-manager", () => {
    const readOnly = { visible: true, readOnly: true, storedHandle: "atos", canManage: false };
    const utils = renderTraining({ gymInstagram: "@atos" }, readOnly);
    const input = utils.getByTestId("setup-gym-instagram");
    expect(input.props.editable).toBe(false);
    expect(input.props.value).toBe("@atos");
  });

  it("blocks submit on a malformed gym handle", () => {
    const onSubmit = jest.fn();
    const utils = render(
      <TrainingStep
        values={{ ...VALUES, gymInstagram: "a..b" }}
        onChange={jest.fn()}
        onSubmit={onSubmit}
        loading={false}
        isEditing={false}
        gyms={[]}
        cities={[]}
        gymInstagram={editable}
      />,
    );
    expect(utils.getByText(INSTAGRAM_HANDLE_ERROR)).toBeTruthy();
    fireEvent.press(utils.getByText("Get Started"));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
