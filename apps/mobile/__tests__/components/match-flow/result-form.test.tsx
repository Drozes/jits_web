/**
 * The result form's full scrollable submission list (timekeeper mode A12,
 * PM12; TEST-PLAN 3.2 `result-form`) and the exported, self-contained
 * `ResultForm` (review round 3, R3-4): it renders with no match-flow context
 * from `onSubmit`, a kicker, `submissionLayout`, `athletes` (challenger
 * first) and the clock bounds, which is how the timekeeper's edit and Admin
 * > Timekeeper reviews (M10) use it.
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { ScrollView, StyleSheet } from "react-native";
import type { SubmissionType } from "@jits/shared/types/submission-type";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textTertiary: "#8D929D", textOnAccent: "#0D0F14", textPrimary: "#fff" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});

import { ResultForm, SubmissionList } from "@/components/match-flow/steps/result-form";
import { paletteFor } from "@/lib/theme/palette";

const type = (code: string, display_name: string, sort_order: number): SubmissionType =>
  ({ code, display_name, category: "x", id: code, sort_order, status: "active" }) as SubmissionType;
const TYPES = [
  type("other", "Other Submission", 0),
  type("rear_naked_choke", "Rear Naked Choke", 1),
  type("guillotine", "Guillotine", 2),
  type("toe_hold", "Toe Hold", 3),
  type("wristlock", "Wristlock", 4),
  type("bicep_slicer", "Bicep Slicer", 5),
  type("calf_slicer", "Calf Slicer", 6),
  type("gogoplata", "Gogoplata", 7),
  type("baseball_bat_choke", "Baseball Bat Choke", 8),
  type("north_south_choke", "North South Choke", 9),
];

/** Challenger first, as the timekeeper and an admin pass them. */
const ATHLETES = [
  { athleteId: "ch", displayName: "Marco Reyes", currentElo: 1512, weightLbs: 172.5 },
  { athleteId: "op", displayName: "Dayo Okafor", currentElo: 1487, weightLbs: 171.4 },
] as const;

const DARK = paletteFor("dark");

function renderForm(overrides: Partial<React.ComponentProps<typeof ResultForm>> = {}) {
  const onSubmit = jest.fn();
  const s = render(
    <ResultForm
      athletes={ATHLETES}
      durationSeconds={300}
      finalElapsedS={228}
      submissionTypes={TYPES}
      submissionLayout="list"
      onSubmit={onSubmit}
      kicker="You're recording for M. Reyes and D. Okafor. They confirm it next."
      {...overrides}
    />,
  );
  return { s, onSubmit };
}

describe("the full list (A12)", () => {
  it("lists every finish in catalogue order, Other last, in a scrollable list, not the eight chips", () => {
    const s = render(<SubmissionList submissionTypes={TYPES} value="" onChange={jest.fn()} />);
    s.getByText("HOW DID IT END?");
    const rows = s.getAllByTestId(/^result-submission-(?!list)/).map((n) => n.props.testID);
    expect(rows).toEqual([
      "result-submission-rear_naked_choke",
      "result-submission-guillotine",
      "result-submission-toe_hold",
      "result-submission-wristlock",
      "result-submission-bicep_slicer",
      "result-submission-calf_slicer",
      "result-submission-gogoplata",
      "result-submission-baseball_bat_choke",
      "result-submission-north_south_choke",
      "result-submission-other",
    ]);
    // A fixed-height window that scrolls on its own, inside the step's scroll.
    const scroll = s.UNSAFE_getByType(ScrollView);
    expect(scroll.props.nestedScrollEnabled).toBe(true);
    expect(s.getByTestId("result-submission-list").props.style).toEqual(expect.objectContaining({ height: 312 }));
    // No search field: the list is the whole catalogue.
    expect(s.queryByTestId("result-submission")).toBeNull();
  });

  it("a tap picks the finish; the chosen row is the one selected treatment (plate-bright, hairline-strong edge, ink check), never red", () => {
    const onChange = jest.fn();
    const s = render(<SubmissionList submissionTypes={TYPES} value="toe_hold" onChange={onChange} />);
    fireEvent.press(s.getByTestId("result-submission-gogoplata"));
    expect(onChange).toHaveBeenCalledWith("gogoplata");
    const chosen = s.getByTestId("result-submission-toe_hold");
    expect(chosen.props.accessibilityState).toEqual({ selected: true });
    const style = Array.isArray(chosen.props.style) ? Object.assign({}, ...chosen.props.style) : chosen.props.style;
    expect(style.backgroundColor).toBe(DARK.panel);
    expect(style.backgroundColor).not.toBe(DARK.cta);
    // The hairline-strong edge all round, as the chips' selected edge (elo-system/selection.tsx).
    expect(style).toEqual(expect.objectContaining({ borderWidth: 1, borderColor: DARK.strong }));
    expect(style.borderColor).not.toBe(DARK.cta);
    // The other rows keep the hairline divider; the row above the chosen one gives it up for that edge.
    const flat = (id: string) => StyleSheet.flatten(s.getByTestId(id).props.style);
    expect(flat("result-submission-guillotine")).toEqual(expect.objectContaining({ borderBottomWidth: 0 }));
    expect(flat("result-submission-wristlock")).toEqual(expect.objectContaining({ borderBottomWidth: 1, borderColor: DARK.hairline }));
    expect(flat("result-submission-wristlock").borderWidth).toBeUndefined();
    expect(s.getByTestId("result-submission-guillotine").props.accessibilityState).toEqual({ selected: false });
    // The ink check (`SelectCheck`): decorative, so hidden from accessibility (the row carries `selected`).
    expect(s.getAllByTestId("icon-Check", { includeHiddenElements: true })).toHaveLength(1);
  });

  it("opens on the chosen row (an edit starts from the recorded finish)", () => {
    const s = render(<SubmissionList submissionTypes={TYPES} value="gogoplata" onChange={jest.fn()} />);
    // gogoplata is the 7th row: open with the row above it at the top.
    const scroll = s.UNSAFE_getByType(ScrollView);
    // The mock's scrollTo is one jest.fn shared by every instance.
    scroll.instance.scrollTo.mockClear();
    expect(scroll.props.contentOffset).toEqual({ x: 0, y: 5 * 48 });
    // `contentOffset` is iOS only: once the rows are laid out the list is placed
    // there on every platform, once, and then scrolls freely.
    fireEvent(scroll, "contentSizeChange", 0, 480);
    expect(scroll.instance.scrollTo).toHaveBeenCalledTimes(1);
    expect(scroll.instance.scrollTo).toHaveBeenCalledWith({ x: 0, y: 5 * 48, animated: false });
    fireEvent(scroll, "contentSizeChange", 0, 520);
    expect(scroll.instance.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("with no finish chosen, opens at the top and is never moved", () => {
    const s = render(<SubmissionList submissionTypes={TYPES} value="" onChange={jest.fn()} />);
    const scroll = s.UNSAFE_getByType(ScrollView);
    scroll.instance.scrollTo.mockClear();
    expect(scroll.props.contentOffset).toEqual({ x: 0, y: 0 });
    fireEvent(scroll, "contentSizeChange", 0, 480);
    expect(scroll.instance.scrollTo).not.toHaveBeenCalled();
  });
});

describe("ResultForm, standalone", () => {
  it("renders with no match-flow context: the athletes challenger first, no YOU / OPPONENT, the kicker", () => {
    const { s } = renderForm();
    s.getByText("Record result");
    s.getByText("ENDED AT 03:48");
    expect(s.getAllByTestId(/^result-winner-/).map((n) => n.props.testID)).toEqual(["result-winner-ch", "result-winner-op"]);
    expect(s.queryByText("YOU")).toBeNull();
    expect(s.queryByText("OPPONENT")).toBeNull();
    s.getByText("You're recording for M. Reyes and D. Okafor. They confirm it next.");
  });

  it("records a submission from the list, the finish prefilled from the final clock", () => {
    const { s, onSubmit } = renderForm();
    fireEvent.press(s.getByTestId("result-winner-op"));
    s.getByTestId("result-submission-list");
    fireEvent.press(s.getByTestId("result-submission-toe_hold"));
    expect(s.getByTestId("result-finish-time").props.value).toBe("03:48");
    s.getByTestId("result-finish-time-hint");
    fireEvent.press(s.getByTestId("result-record"));
    expect(onSubmit).toHaveBeenCalledWith({
      outcome: "submission",
      winnerId: "op",
      submissionCode: "toe_hold",
      finishTimeStr: "03:48",
    });
  });

  it("the final clock bounds the finish time (the server refuses past it)", () => {
    const { s, onSubmit } = renderForm();
    fireEvent.press(s.getByTestId("result-winner-ch"));
    fireEvent.press(s.getByTestId("result-submission-guillotine"));
    fireEvent.changeText(s.getByTestId("result-finish-time"), "4:00");
    s.getByText("WITHIN 03:48");
    fireEvent.press(s.getByTestId("result-record"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("without a final clock, the match length bounds it and nothing is prefilled", () => {
    const { s } = renderForm({ finalElapsedS: null });
    expect(s.queryByText(/ENDED AT/)).toBeNull();
    fireEvent.press(s.getByTestId("result-winner-ch"));
    expect(s.getByTestId("result-finish-time").props.value).toBe("");
    fireEvent.changeText(s.getByTestId("result-finish-time"), "5:01");
    s.getByText("WITHIN 05:00");
  });

  it("records a draw, with no points note (A28)", () => {
    const { s, onSubmit } = renderForm();
    fireEvent.press(s.getByTestId("result-outcome-draw"));
    s.getByText("Match ends in a draw");
    expect(s.queryByText(/points/i)).toBeNull();
    fireEvent.press(s.getByTestId("result-record"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "draw", winnerId: "" }));
  });

  it("starts from a recorded result: the winner chosen, the finish selected, its time (not from the clock)", () => {
    const { s, onSubmit } = renderForm({
      initial: { outcome: "submission", winnerId: "ch", submissionCode: "wristlock", finishTimeSeconds: 95 },
      copy: { title: "Edit result", submit: { text: "Save changes", busy: "Saving..." } },
    });
    s.getByText("Edit result");
    s.getByTestId("result-winner-chip");
    expect(s.getByTestId("result-submission-wristlock").props.accessibilityState).toEqual({ selected: true });
    expect(s.getByTestId("result-finish-time").props.value).toBe("01:35");
    expect(s.queryByTestId("result-finish-time-hint")).toBeNull();
    s.getByText("Save changes");
    fireEvent.press(s.getByTestId("result-record"));
    expect(onSubmit).toHaveBeenCalledWith({ outcome: "submission", winnerId: "ch", submissionCode: "wristlock", finishTimeStr: "01:35" });
  });

  it("an edit (requireChange) submits only once the result differs from the one it started from", () => {
    const { s, onSubmit } = renderForm({
      initial: { outcome: "submission", winnerId: "ch", submissionCode: "wristlock", finishTimeSeconds: 95 },
      requireChange: true,
    });
    const record = () => s.getByTestId("result-record");
    expect(record().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(record());
    expect(onSubmit).not.toHaveBeenCalled();
    // The same time typed another way is no change.
    fireEvent.changeText(s.getByTestId("result-finish-time"), "1:35");
    expect(record().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    // Each field on its own is a change; changing it back is none.
    fireEvent.changeText(s.getByTestId("result-finish-time"), "1:40");
    expect(record().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    fireEvent.changeText(s.getByTestId("result-finish-time"), "01:35");
    expect(record().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(s.getByTestId("result-submission-guillotine"));
    expect(record().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    fireEvent.press(s.getByTestId("result-submission-wristlock"));
    expect(record().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(s.getByTestId("result-change"));
    fireEvent.press(s.getByTestId("result-winner-op"));
    expect(record().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    fireEvent.press(record());
    expect(onSubmit).toHaveBeenCalledWith({ outcome: "submission", winnerId: "op", submissionCode: "wristlock", finishTimeStr: "01:35" });
  });

  it("an edit of a recorded draw: off while it is still a draw, on once it is a submission", () => {
    const { s, onSubmit } = renderForm({
      initial: { outcome: "draw", winnerId: "", submissionCode: "", finishTimeSeconds: null },
      requireChange: true,
    });
    expect(s.getByTestId("result-record").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(s.getByTestId("result-change-draw"));
    fireEvent.press(s.getByTestId("result-outcome-draw"));
    expect(s.getByTestId("result-record").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(s.getByTestId("result-change-draw"));
    fireEvent.press(s.getByTestId("result-winner-ch"));
    fireEvent.press(s.getByTestId("result-submission-guillotine"));
    fireEvent.changeText(s.getByTestId("result-finish-time"), "2:00");
    fireEvent.press(s.getByTestId("result-record"));
    expect(onSubmit).toHaveBeenCalledWith({ outcome: "submission", winnerId: "ch", submissionCode: "guillotine", finishTimeStr: "2:00" });
  });

  it("starts from a recorded draw, and Change goes back to the tiles", () => {
    const { s } = renderForm({ initial: { outcome: "draw", winnerId: "", submissionCode: "", finishTimeSeconds: null } });
    s.getByText("Match ends in a draw");
    fireEvent.press(s.getByTestId("result-change-draw"));
    s.getByTestId("result-winner-ch");
  });

  it("busy: the busy label, and a notice under the heading when given", () => {
    const { s } = renderForm({
      busy: true,
      initial: { outcome: "draw", winnerId: "", submissionCode: "", finishTimeSeconds: null },
      copy: { notice: "Record the result now. Without it, an admin reviews the match." },
    });
    s.getByText("Recording...");
    expect(s.getByTestId("result-form-notice")).toHaveTextContent("Record the result now. Without it, an admin reviews the match.");
    // In the attention token (amber), never red.
    expect(StyleSheet.flatten(s.getByTestId("result-form-notice").props.style).color).toBe(DARK.amber);
  });

  it("the chips layout stays available standalone", () => {
    const { s } = renderForm({ submissionLayout: "chips" });
    fireEvent.press(s.getByTestId("result-winner-ch"));
    expect(s.queryByTestId("result-submission-list")).toBeNull();
    s.getByTestId("result-submission");
  });
});
