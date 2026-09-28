/**
 * Submission field on the result step: a single select that opens the
 * shared full-screen autocomplete (SearchSelect) instead of a chip grid.
 * Shared by the Arena result step and the practice match.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import type { SubmissionType } from "@jits/shared/types/submission-type";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textTertiary: "#8D929D", bgPrimary: "#0D0F14" }),
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) =>
        prop === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${prop}` }),
    },
  );
});

import { SubmissionFields } from "@/components/match-flow/steps/submission-fields";

const t = (code: string, display_name: string): SubmissionType => ({
  code,
  display_name,
  category: "choke",
  id: code,
  sort_order: 0,
  status: "active",
});
const TYPES = [
  t("rear_naked_choke", "Rear Naked Choke"),
  t("guillotine", "Guillotine"),
  t("darce", "D'Arce"),
  t("north_south_choke", "North-South Choke"),
  t("other", "Other Submission"),
];

function Harness({
  types = TYPES,
  onChange,
}: {
  types?: SubmissionType[];
  onChange?: (v: string) => void;
}) {
  const [code, setCode] = React.useState("");
  return (
    <SubmissionFields
      submissionTypes={types}
      submissionCode={code}
      finishTimeStr=""
      durationSeconds={300}
      finishTimeInvalid={false}
      onSubmissionChange={(v) => {
        setCode(v);
        onChange?.(v);
      }}
      onFinishTimeChange={jest.fn()}
    />
  );
}

const open = (s: ReturnType<typeof render>) => fireEvent.press(s.getByTestId("result-submission"));
const type = (s: ReturnType<typeof render>, q: string) =>
  fireEvent.changeText(s.getByTestId("result-submission-search"), q);

describe("SubmissionFields picker", () => {
  it("renders one accessible select field instead of a chip grid", () => {
    const s = render(<Harness />);
    const field = s.getByTestId("result-submission");
    expect(field).toHaveTextContent(/Select submission/);
    expect(field.props.accessibilityRole).toBe("button");
    expect(s.getByLabelText("Submission, Select submission")).toBeTruthy();
    expect(s.queryByTestId("result-submission-option-guillotine")).toBeNull();
  });

  it("opens a full-screen picker titled Submission with every option", () => {
    const s = render(<Harness />);
    open(s);
    expect(s.getByTestId("result-submission-search")).toBeTruthy();
    for (const st of TYPES) {
      expect(s.getByTestId(`result-submission-option-${st.code}`)).toBeTruthy();
    }
  });

  it("filters as you type, ignoring case and punctuation", () => {
    const s = render(<Harness />);
    open(s);
    type(s, "DARCE");
    expect(s.getByTestId("result-submission-option-darce")).toBeTruthy();
    expect(s.queryByTestId("result-submission-option-guillotine")).toBeNull();
    type(s, "north south");
    expect(s.getByTestId("result-submission-option-north_south_choke")).toBeTruthy();
    expect(s.queryByTestId("result-submission-option-darce")).toBeNull();
    type(s, "rnc");
    expect(s.getByTestId("result-submission-option-rear_naked_choke")).toBeTruthy();
  });

  it("selecting an option sets the code, closes the picker and shows the name", () => {
    const onChange = jest.fn();
    const s = render(<Harness onChange={onChange} />);
    open(s);
    type(s, "guil");
    fireEvent.press(s.getByTestId("result-submission-option-guillotine"));
    expect(onChange).toHaveBeenCalledWith("guillotine");
    expect(s.queryByTestId("result-submission-search")).toBeNull();
    expect(s.getByTestId("result-submission")).toHaveTextContent(/Guillotine/);
    // Screen readers hear the selection in the name, not only in the hint.
    expect(s.getByLabelText("Submission, Guillotine")).toBeTruthy();
  });

  it("marks the selected option when reopened", () => {
    const s = render(<Harness />);
    open(s);
    fireEvent.press(s.getByTestId("result-submission-option-darce"));
    open(s);
    expect(s.getByTestId("result-submission-option-darce").props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(
      s.getByTestId("result-submission-option-guillotine").props.accessibilityState,
    ).toMatchObject({ selected: false });
  });

  it("clear button empties the query and restores the full list", () => {
    const s = render(<Harness />);
    open(s);
    expect(s.queryByTestId("result-submission-clear")).toBeNull();
    type(s, "guil");
    expect(s.queryByTestId("result-submission-option-darce")).toBeNull();
    fireEvent.press(s.getByTestId("result-submission-clear"));
    expect(s.getByTestId("result-submission-search").props.value).toBe("");
    expect(s.getByTestId("result-submission-option-darce")).toBeTruthy();
    expect(s.queryByTestId("result-submission-clear")).toBeNull();
  });

  it("shows the empty state and keeps Other available when nothing matches", () => {
    const onChange = jest.fn();
    const s = render(<Harness onChange={onChange} />);
    open(s);
    type(s, "zzzz");
    expect(s.getByTestId("result-submission-empty")).toHaveTextContent("No submissions match");
    fireEvent.press(s.getByTestId("result-submission-option-other"));
    expect(onChange).toHaveBeenCalledWith("other");
    expect(s.getByTestId("result-submission")).toHaveTextContent(/Other Submission/);
  });

  it("shows only the empty state when there is no Other type", () => {
    const s = render(<Harness types={TYPES.filter((x) => x.code !== "other")} />);
    open(s);
    type(s, "zzzz");
    expect(s.getByTestId("result-submission-empty")).toHaveTextContent("No submissions match");
    expect(s.queryByTestId("result-submission-option-other")).toBeNull();
  });

  it("close dismisses without changing the value", () => {
    const onChange = jest.fn();
    const s = render(<Harness onChange={onChange} />);
    open(s);
    fireEvent.press(s.getByTestId("result-submission-close"));
    expect(s.queryByTestId("result-submission-search")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(s.getByTestId("result-submission")).toHaveTextContent(/Select submission/);
  });

  it("close after typing keeps the previously chosen submission", () => {
    const onChange = jest.fn();
    const s = render(<Harness onChange={onChange} />);
    open(s);
    fireEvent.press(s.getByTestId("result-submission-option-guillotine"));
    open(s);
    type(s, "dar");
    fireEvent.press(s.getByTestId("result-submission-close"));
    expect(s.queryByTestId("result-submission-search")).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(s.getByTestId("result-submission")).toHaveTextContent(/Guillotine/);
  });

  it("Android back (onRequestClose) dismisses without changing the value", () => {
    const onChange = jest.fn();
    const s = render(<Harness onChange={onChange} />);
    open(s);
    type(s, "dar");
    const { Modal } = require("react-native");
    act(() => s.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(s.queryByTestId("result-submission-search")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(s.getByTestId("result-submission")).toHaveTextContent(/Select submission/);
  });

  it("a whitespace-only query shows every option and no empty state", () => {
    const s = render(<Harness />);
    open(s);
    type(s, "   ");
    for (const st of TYPES) {
      expect(s.getByTestId(`result-submission-option-${st.code}`)).toBeTruthy();
    }
    expect(s.queryByTestId("result-submission-empty")).toBeNull();
  });
});
