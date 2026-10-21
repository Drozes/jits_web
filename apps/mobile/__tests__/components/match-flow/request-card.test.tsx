/**
 * The picker's open request (timekeeper mode M2, boards P-TK-B2 frames 3
 * and 4): mine reads TK-P17, the other athlete's TK-P20, both with TK-P18 and
 * `Ask someone else` (TK-P19, either athlete may withdraw, R5), and the card
 * is the attention token (pending), never Signal Red.
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "dark",
  useThemedTokens: () => jest.requireActual("@/lib/tokens").darkTokens,
}));

import { RequestCard } from "@/components/match-flow/crew/request-card";
import { AttentionLine } from "@/components/match-flow/crew/attention-line";
import { paletteFor } from "@/lib/theme/palette";

const P = paletteFor("dark");

describe("RequestCard", () => {
  it("mine: Asked {name}, waiting, Ask someone else", () => {
    const onWithdraw = jest.fn();
    const s = render(
      <RequestCard request={{ mine: true, requesterShort: "M. Reyes", inviteeShort: "J. Cruz" }} withdrawing={false} onWithdraw={onWithdraw} />,
    );
    expect(s.getByTestId("crew-request-title")).toHaveTextContent("Asked J. Cruz");
    s.getByText("Waiting for them to accept.");
    fireEvent.press(s.getByLabelText("Ask someone else"));
    expect(onWithdraw).toHaveBeenCalledTimes(1);
  });

  it("the other athlete's: {athlete} asked {name}, and they may withdraw it too", () => {
    const onWithdraw = jest.fn();
    const s = render(
      <RequestCard request={{ mine: false, requesterShort: "M. Reyes", inviteeShort: "J. Cruz" }} withdrawing={false} onWithdraw={onWithdraw} />,
    );
    expect(s.getByTestId("crew-request-title")).toHaveTextContent("M. Reyes asked J. Cruz");
    fireEvent.press(s.getByLabelText("Ask someone else"));
    expect(onWithdraw).toHaveBeenCalledTimes(1);
  });

  it("a withdrawal in flight cannot be sent twice", () => {
    const onWithdraw = jest.fn();
    const s = render(
      <RequestCard request={{ mine: true, requesterShort: "M. Reyes", inviteeShort: "J. Cruz" }} withdrawing onWithdraw={onWithdraw} />,
    );
    fireEvent.press(s.getByLabelText("Ask someone else"));
    expect(onWithdraw).not.toHaveBeenCalled();
  });

  it("pending is amber: a dashed amber rule, never Signal Red", () => {
    const s = render(
      <RequestCard request={{ mine: true, requesterShort: "M. Reyes", inviteeShort: "J. Cruz" }} withdrawing={false} onWithdraw={jest.fn()} />,
    );
    const box = StyleSheet.flatten(s.getByTestId("crew-request-card").props.style);
    expect(box.borderColor).toBe(P.amber);
    expect(box.borderStyle).toBe("dashed");
    expect([P.cta, P.red, P.loss]).not.toContain(box.borderColor);
  });
});

describe("AttentionLine (TK-P21, TK-P22, TK-D1, TK-T8)", () => {
  it("is an alert in amber text on a dashed amber rule", () => {
    const s = render(<AttentionLine testID="line" text="J. Cruz can't timekeep. Pick someone else." />);
    const line = s.getByTestId("line");
    expect(line.props.accessibilityRole).toBe("alert");
    expect(StyleSheet.flatten(line.props.style).borderColor).toBe(P.amber);
    const text = s.getByText("J. Cruz can't timekeep. Pick someone else.");
    expect(StyleSheet.flatten(text.props.style).color).toBe(P.amber);
  });
});
