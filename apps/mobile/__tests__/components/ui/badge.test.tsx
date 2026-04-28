import * as React from "react";
import { render } from "@testing-library/react-native";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  const variants = [
    "default",
    "secondary",
    "destructive",
    "success",
    "outline",
  ] as const;

  describe("variants", () => {
    it.each(variants)("renders %s variant without crashing", (variant) => {
      const { getByText } = render(
        <Badge variant={variant}>Label</Badge>,
      );
      expect(getByText("Label")).toBeTruthy();
    });
  });

  it("renders text content correctly", () => {
    const { getByText } = render(<Badge>Win</Badge>);
    expect(getByText("Win")).toBeTruthy();
  });

  it("renders non-string children", () => {
    const { getByTestId } = render(
      <Badge>
        <React.Fragment>
          <>{/* non-string child */}</>
        </React.Fragment>
      </Badge>,
    );
    // No crash means pass.
    expect(true).toBe(true);
  });

  it("renders the success variant (custom addition for win badges)", () => {
    const { getByText } = render(
      <Badge variant="success">+15</Badge>,
    );
    expect(getByText("+15")).toBeTruthy();
  });

  it("accepts custom className and textClassName", () => {
    const { getByText } = render(
      <Badge className="mt-2" textClassName="text-lg">
        Styled
      </Badge>,
    );
    expect(getByText("Styled")).toBeTruthy();
  });
});
