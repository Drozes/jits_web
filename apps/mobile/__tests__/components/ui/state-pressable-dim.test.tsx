/**
 * `StatePressable dim` (WP3, BT-6): the pressed feedback of rows, chips and
 * toggles that do not scale. Dips to PRESSED_OPACITY while held, never while
 * disabled, and keeps the caller's own (function) style.
 */
import * as React from "react";
import { StyleSheet, Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { PRESSED_OPACITY, StatePressable } from "@/components/ui/state-pressable";

const flat = (el: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(el.props.style as never) ?? {}) as Record<string, unknown>;

describe("StatePressable dim", () => {
  it("dips to the pressed opacity while held and restores on release", () => {
    const s = render(
      <StatePressable testID="row" dim onPress={jest.fn()}>
        <Text>row</Text>
      </StatePressable>,
    );
    expect(flat(s.getByTestId("row")).opacity).toBeUndefined();
    fireEvent(s.getByTestId("row"), "pressIn");
    expect(flat(s.getByTestId("row")).opacity).toBe(PRESSED_OPACITY);
    fireEvent(s.getByTestId("row"), "pressOut");
    expect(flat(s.getByTestId("row")).opacity).toBeUndefined();
  });

  it("keeps the caller's style (static or a function of pressed) under the dip", () => {
    const s = render(
      <StatePressable testID="chip" dim style={({ pressed }) => ({ height: 36, borderWidth: pressed ? 2 : 1 })}>
        <Text>chip</Text>
      </StatePressable>,
    );
    fireEvent(s.getByTestId("chip"), "pressIn");
    const st = flat(s.getByTestId("chip"));
    expect(st.height).toBe(36);
    expect(st.borderWidth).toBe(2);
    expect(st.opacity).toBe(PRESSED_OPACITY);
  });

  it("a disabled row is never dimmed by a press", () => {
    const s = render(
      <StatePressable testID="row" dim disabled onPress={jest.fn()}>
        <Text>row</Text>
      </StatePressable>,
    );
    fireEvent(s.getByTestId("row"), "pressIn");
    expect(flat(s.getByTestId("row")).opacity).toBeUndefined();
  });

  it("without dim nothing changes (the existing StatePressable contract)", () => {
    const s = render(
      <StatePressable testID="row" style={{ height: 10 }} onPress={jest.fn()}>
        <Text>row</Text>
      </StatePressable>,
    );
    fireEvent(s.getByTestId("row"), "pressIn");
    expect(flat(s.getByTestId("row")).opacity).toBeUndefined();
  });
});
