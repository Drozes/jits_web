/**
 * Result step selection colour (jits-23o8). Signal Red is for CTAs and
 * state-negative only, and a selection is neither: the selected outcome chip
 * and winner card use an ink border, and a selected Draw reads amber.
 */
import * as React from "react";
import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";

const TOKENS = {
  textPrimary: "#E8EDF2",
  textTertiary: "#8D929D",
  accentCta: "#E63946",
};
let mockScheme: "dark" | "light" = "dark";
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => TOKENS,
  useResolvedColorScheme: () => mockScheme,
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const make = (name: string) => (props: { color?: string }) =>
    R.createElement(RN.View, { testID: `icon-${name}`, color: props.color });
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) =>
        prop === "__esModule" ? true : make(prop),
    },
  );
});

import { OutcomeToggle, WinnerPicker } from "@/components/match-flow/steps/result-step-fields";

/** NativeWind in jest leaves the class string on the host node. */
function classOf(node: { props: Record<string, unknown> }): string {
  const raw = node.props.className;
  if (typeof raw === "string") return raw;
  return JSON.stringify(StyleSheet.flatten(node.props.style as never) ?? {});
}

beforeEach(() => {
  mockScheme = "dark";
});

describe("OutcomeToggle selection", () => {
  it("a selected Submission is ink, never Signal Red", () => {
    const r = render(<OutcomeToggle value="submission" onChange={jest.fn()} />);
    const chip = r.getByTestId("result-outcome-submission");
    expect(classOf(chip)).toContain("border-ink");
    expect(classOf(chip)).not.toContain("border-cta");
    expect(r.getByTestId("icon-Swords").props.color).toBe(TOKENS.textPrimary);
  });

  it("a selected Draw is amber (dark and light shades)", () => {
    const r = render(<OutcomeToggle value="draw" onChange={jest.fn()} />);
    expect(classOf(r.getByTestId("result-outcome-draw"))).toContain("border-amber-500");
    expect(r.getByTestId("icon-Handshake").props.color).toBe("#F59E0B");
    r.unmount();

    mockScheme = "light";
    const l = render(<OutcomeToggle value="draw" onChange={jest.fn()} />);
    expect(classOf(l.getByTestId("result-outcome-draw"))).toContain("border-amber-600");
    expect(l.getByTestId("icon-Handshake").props.color).toBe("#D97706");
  });

  it("no chip ever uses the Signal Red accent, selected or not", () => {
    for (const value of ["submission", "draw", null] as const) {
      const r = render(<OutcomeToggle value={value} onChange={jest.fn()} />);
      for (const icon of [r.getByTestId("icon-Swords"), r.getByTestId("icon-Handshake")]) {
        expect(icon.props.color).not.toBe(TOKENS.accentCta);
      }
      for (const id of ["result-outcome-submission", "result-outcome-draw"]) {
        expect(classOf(r.getByTestId(id))).not.toContain("border-cta");
      }
      r.unmount();
    }
  });
});

describe("WinnerPicker selection", () => {
  it("the selected athlete is ink, never Signal Red", () => {
    const r = render(
      <WinnerPicker
        participants={[
          { id: "a", displayName: "Alpha" },
          { id: "b", displayName: "Bravo" },
        ]}
        winnerId="a"
        onChange={jest.fn()}
      />,
    );
    expect(classOf(r.getByTestId("result-winner-a"))).toContain("border-ink");
    expect(classOf(r.getByTestId("result-winner-a"))).not.toContain("border-cta");
    expect(classOf(r.getByTestId("result-winner-b"))).toContain("border-hairline-strong");
  });
});
