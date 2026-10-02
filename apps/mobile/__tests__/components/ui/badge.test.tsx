import * as React from "react";
import { render } from "@testing-library/react-native";
import { Badge } from "@/components/ui/badge";

/**
 * Badge on ELO tokens (WP4, R3 LG-2): the MetaTag look (2px tag radius, 1px
 * border, 10px mono caps), the variant API kept, `success` included.
 */
describe("Badge", () => {
  const variants = ["default", "secondary", "destructive", "success", "outline"] as const;

  const LEGACY = /\b(bg|text|border)-(primary|secondary|destructive|success|border|foreground|background|muted)(-foreground)?\b|rounded-lg|font-semibold|font-medium|text-xs/;

  it.each(variants)("renders the %s variant on ELO tokens only", (variant) => {
    const { getByText } = render(<Badge testID="b" variant={variant}>Label</Badge>);
    const text = getByText("Label");
    expect(String(text.props.className)).toMatch(/font-mono.*text-\[10px\].*uppercase.*tracking-caps-l/);
    expect(String(text.props.className)).not.toMatch(LEGACY);
  });

  it.each(variants)("the %s variant is a tag: 2px radius, a border, never a red fill", (variant) => {
    const { getByTestId } = render(<Badge testID="b" variant={variant}>Label</Badge>);
    const cls = String(getByTestId("b").props.className);
    expect(cls).toContain("rounded-xs");
    expect(cls).toMatch(/\bborder\b/);
    expect(cls).not.toMatch(/bg-cta|bg-negative/);
    expect(cls).not.toMatch(LEGACY);
  });

  it("maps each tone to its ELO color", () => {
    const tone = (variant: (typeof variants)[number]) => {
      const { getByText, getByTestId, unmount } = render(<Badge testID="b" variant={variant}>T</Badge>);
      const out = { box: String(getByTestId("b").props.className), text: String(getByText("T").props.className) };
      unmount();
      return out;
    };
    expect(tone("default")).toEqual({ box: expect.stringContaining("border-hairline-strong"), text: expect.stringContaining("text-ink") });
    expect(tone("secondary").box).toContain("bg-surface-3");
    expect(tone("secondary").text).toContain("text-ink-2");
    expect(tone("destructive")).toEqual({ box: expect.stringContaining("border-negative"), text: expect.stringContaining("text-negative") });
    expect(tone("success")).toEqual({ box: expect.stringContaining("border-positive"), text: expect.stringContaining("text-positive") });
    expect(tone("outline")).toEqual({ box: expect.stringContaining("border-hairline"), text: expect.stringContaining("text-ink-2") });
  });

  it("defaults to the default variant", () => {
    const { getByText } = render(<Badge>Win</Badge>);
    expect(String(getByText("Win").props.className)).toContain("text-ink");
  });

  it("renders non-string children as-is", () => {
    const { getByTestId } = render(
      <Badge>
        <React.Fragment>
          <Badge testID="inner">x</Badge>
        </React.Fragment>
      </Badge>,
    );
    expect(getByTestId("inner")).toBeTruthy();
  });

  it("keeps the custom success variant (win badges)", () => {
    const { getByText } = render(<Badge variant="success">+15</Badge>);
    expect(getByText("+15")).toBeTruthy();
  });

  it("accepts custom className and textClassName", () => {
    const { getByText, getByTestId } = render(
      <Badge testID="b" className="mt-2" textClassName="text-ink-3">
        Styled
      </Badge>,
    );
    expect(String(getByTestId("b").props.className)).toContain("mt-2");
    expect(String(getByText("Styled").props.className)).toContain("text-ink-3");
  });
});
