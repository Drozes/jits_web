/**
 * TK-W1 `CANCELS IN {m:ss}` on the picker (timekeeper mode M2, spec 14.8 M2;
 * COPY-DECK Round 5): the attention (amber) token throughout, never Signal
 * Red; from 2:00 down a still emphasis (bold text, the full amber rule), no
 * animation; the countdown turns over each second; the spoken label is the
 * deck's.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("@/lib/theme/use-theme", () => ({ useResolvedColorScheme: () => "dark" }));

import { DeadlineChip, DEADLINE_EMPHASIS_S } from "@/components/match-flow/crew/deadline-chip";
import { paletteFor } from "@/lib/theme/palette";

const P = paletteFor("dark");
const NOW = Date.parse("2026-10-20T10:00:00.000Z");
const at = (seconds: number) => new Date(NOW + seconds * 1000).toISOString();

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});
afterEach(() => jest.useRealTimers());

function chip(deadlineAt: string | null) {
  const s = render(<DeadlineChip deadlineAt={deadlineAt} />);
  return {
    s,
    text: () => s.getByTestId("crew-deadline-text"),
    box: () => StyleSheet.flatten(s.getByTestId("crew-deadline").props.style),
    textStyle: () => StyleSheet.flatten(s.getByTestId("crew-deadline-text").props.style),
  };
}

describe("DeadlineChip (TK-W1)", () => {
  it("counts down to the pick deadline with the deck's text and spoken label", () => {
    const c = chip(at(9 * 60 + 12));
    expect(c.text()).toHaveTextContent("CANCELS IN 9:12");
    // One accessibility element (iOS ignores the label on a View that is not
    // `accessible`, and VoiceOver would read the child text instead).
    const timer = c.s.getByLabelText("Match cancels in 9 minutes 12 seconds");
    expect(timer.props.accessible).toBe(true);
    expect(timer.props.accessibilityRole).toBe("timer");
    act(() => jest.advanceTimersByTime(1_000));
    expect(c.text()).toHaveTextContent("CANCELS IN 9:11");
    act(() => jest.advanceTimersByTime(60_000));
    expect(c.text()).toHaveTextContent("CANCELS IN 8:11");
  });

  it("is amber above 2:00: regular text on the softer amber rule", () => {
    const c = chip(at(DEADLINE_EMPHASIS_S + 30));
    expect(c.textStyle().color).toBe(P.amber);
    expect(c.box().borderColor).toBe(P.amberRule);
    expect(c.text().props.className).toBe("font-mono");
  });

  it("from 2:00 down: bold text on the full amber rule, still amber, never Signal Red", () => {
    const c = chip(at(DEADLINE_EMPHASIS_S + 1));
    expect(c.text().props.className).toBe("font-mono");
    act(() => jest.advanceTimersByTime(1_000));
    expect(c.text()).toHaveTextContent("CANCELS IN 2:00");
    expect(c.text().props.className).toBe("font-mono-bold");
    expect(c.box().borderColor).toBe(P.amber);
    for (const color of [c.textStyle().color, c.box().borderColor]) {
      expect([P.cta, P.red, P.loss]).not.toContain(color);
    }
    act(() => jest.advanceTimersByTime(119_000));
    expect(c.text()).toHaveTextContent("CANCELS IN 0:01");
    act(() => jest.advanceTimersByTime(1_000));
    expect(c.text()).toHaveTextContent("CANCELS IN 0:00");
    // Nothing keeps ticking once it has passed.
    expect(jest.getTimerCount()).toBe(0);
  });

  it("renders nothing without a deadline (a seated timekeeper clears it)", () => {
    const c = chip(null);
    expect(c.s.queryByTestId("crew-deadline")).toBeNull();
  });
});
