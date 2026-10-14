/**
 * The setup wizard's Terms step (jits-rog5.8): shows the Terms' own key
 * points (from the final TERMS.md, not placeholder copy), links to the full
 * Terms and the Privacy Policy in the legal modal, and keeps the single
 * checkbox gating the CTA.
 *
 * Source: apps/mobile/components/profile-setup/tos-step.tsx
 */
import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View);
  return new Proxy({}, { get: (_t, p) => (p === "__esModule" ? true : stub) });
});
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({ textPrimary: "#fff" }) }));

import { TosStep } from "@/components/profile-setup/tos-step";
import { LEGAL_AGREE_LABEL } from "@/lib/legal/legal-copy";

beforeEach(() => jest.clearAllMocks());

describe("TosStep", () => {
  it("shows the Terms' key points, waiver first, and only that section", () => {
    render(<TosStep onAccept={jest.fn()} />);
    expect(screen.getByRole("header", { name: "Key points (please read)" })).toBeTruthy();
    expect(screen.getByText(/ASSUMPTION OF RISK, WAIVER AND RELEASE OF LIABILITY \(SECTION 5\)/)).toBeTruthy();
    expect(screen.queryByRole("header", { name: "Contents" })).toBeNull();
    expect(screen.queryByText(/End User Agreement/)).toBeNull();
  });

  it("puts the Section 5 waiver as the first list item, at the top of the excerpt", () => {
    render(<TosStep onAccept={jest.fn()} />);
    const [first] = screen.getAllByTestId("legal-list-item");
    expect(first).toHaveTextContent(/^THESE TERMS INCLUDE AN ASSUMPTION OF RISK, WAIVER AND RELEASE OF LIABILITY \(SECTION 5\)\./);
    expect(first).toHaveTextContent(/even if they are caused by our negligence/);
  });

  it("names the waiver and the Privacy Policy on the checkbox", () => {
    render(<TosStep onAccept={jest.fn()} />);
    const box = screen.getByRole("checkbox");
    expect(box.props.accessibilityLabel).toBe(LEGAL_AGREE_LABEL);
    expect(LEGAL_AGREE_LABEL).toMatch(/Terms of Service/);
    expect(LEGAL_AGREE_LABEL).toMatch(/Assumption of Risk, Waiver and Release of Liability in Section 5/);
    expect(LEGAL_AGREE_LABEL).toMatch(/Privacy Policy/);
    expect(LEGAL_AGREE_LABEL).not.toMatch(/[\u2014\u2015]/);
  });

  it("the waiver bullet's SECTION 5 opens the Terms at Section 5 (jits-rog5.10)", () => {
    render(<TosStep onAccept={jest.fn()} />);
    const [ref] = screen.getAllByTestId("legal-ref-terms-5");
    expect(ref).toHaveTextContent("SECTION 5");
    expect(ref.props.accessibilityRole).toBe("link");
    fireEvent.press(ref);
    expect(mockPush).toHaveBeenCalledWith("/legal/terms?section=5");
  });

  it("opens the full Terms and the Privacy Policy in the legal modal", () => {
    render(<TosStep onAccept={jest.fn()} />);
    fireEvent.press(screen.getByTestId("legal-link-terms"));
    fireEvent.press(screen.getByTestId("legal-link-privacy"));
    expect(mockPush.mock.calls).toEqual([["/legal/terms"], ["/legal/privacy"]]);
  });

  it("starts unticked with the CTA disabled, and enables it once ticked", async () => {
    const onAccept = jest.fn();
    render(<TosStep onAccept={onAccept} />);
    expect(screen.getByRole("checkbox").props.accessibilityState).toMatchObject({ checked: false });
    const cta = () => screen.getByRole("button", { name: "I Acknowledge" });
    expect(cta().props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByText("I Acknowledge"));
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox").props.accessibilityState).toMatchObject({ checked: true });
    expect(cta().props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(screen.getByText("I Acknowledge"));
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
  });
});
