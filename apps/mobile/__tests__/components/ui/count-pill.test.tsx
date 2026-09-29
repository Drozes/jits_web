/**
 * The shared red count pill (header bell + tab bar): one cap, one type
 * style, and a brand radius (2px `rounded-xs`, never a full pill).
 */
import * as React from "react";
import { render } from "@testing-library/react-native";
import { CountPill, formatBadgeCount } from "@/components/ui/count-pill";

describe("formatBadgeCount", () => {
  it("shows whole numbers and caps at 99+", () => {
    expect(formatBadgeCount(1)).toBe("1");
    expect(formatBadgeCount(99)).toBe("99");
    expect(formatBadgeCount(100)).toBe("99+");
    expect(formatBadgeCount(3.7)).toBe("3");
  });

  it("never shows a negative or non-finite count", () => {
    expect(formatBadgeCount(-2)).toBe("0");
    expect(formatBadgeCount(Number.NaN)).toBe("0");
  });
});

describe("CountPill", () => {
  it("uses the brand radius (rounded-xs), Signal Red fill and the caller's position", () => {
    const u = render(<CountPill testID="pill" text="7" className="top-0 right-0" />);
    const pill = u.getByTestId("pill");
    expect(pill.props.className).toMatch(/\brounded-xs\b/);
    expect(pill.props.className).not.toMatch(/rounded-full/);
    expect(pill.props.className).toMatch(/\bbg-cta\b/);
    expect(pill.props.className).toMatch(/\btop-0\b/);
    expect(u.getByText("7")).toBeTruthy();
  });
});
