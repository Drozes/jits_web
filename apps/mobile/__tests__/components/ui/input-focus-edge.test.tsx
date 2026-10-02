/**
 * WP2 decision (jits-3eeg.3): an input's focus edge is a neutral ink edge
 * (`border-ink-2`, the same 1px stroke), never Signal Red, so focus and
 * error (`border-negative`) no longer look alike. The edge carries the focus
 * state, so it must clear 3:1 against the plate in both themes.
 */
import * as React from "react";
import { TextInput } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { AuthFormField } from "@/components/auth/auth-form-field";
import { EloTextInput } from "@/components/profile-setup/elo-form-field";
import { darkTokens, lightTokens } from "@/lib/tokens";
import { contrast, NON_TEXT } from "../../support/token-contrast";

function input(u: ReturnType<typeof render>) {
  return u.UNSAFE_getByType(TextInput);
}

describe.each([
  ["AuthFormField", (props: { error?: string }) => <AuthFormField label="Email" error={props.error} showError />],
  ["EloTextInput", (props: { error?: string }) => <EloTextInput accessibilityLabel="Weight" hasError={!!props.error} />],
])("%s focus edge", (_name, make) => {
  it("rests on the strong hairline", () => {
    const u = render(make({}));
    expect(input(u).props.className).toMatch(/\bborder-hairline-strong\b/);
  });

  it("focus is a neutral ink edge, never red", () => {
    const u = render(make({}));
    fireEvent(input(u), "focus");
    const cls = input(u).props.className as string;
    expect(cls).toMatch(/\bborder-ink-2\b/);
    expect(cls).not.toMatch(/\bborder-(cta|negative)\b/);
    expect(cls).toMatch(/(^|\s)border(\s|$)/); // the same 1px stroke
  });

  it("error stays negative, so focus and error differ", () => {
    const u = render(make({ error: "Required" }));
    fireEvent(input(u), "focus");
    const cls = input(u).props.className as string;
    expect(cls).toMatch(/\bborder-negative\b/);
    expect(cls).not.toMatch(/\bborder-ink-2\b/);
  });
});

it("the focus edge clears 3:1 on the plate in both themes", () => {
  for (const t of [darkTokens, lightTokens]) {
    expect(contrast(t.textSecondary, t.bgElevated)).toBeGreaterThanOrEqual(NON_TEXT);
  }
});
