import * as React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  describe("variants", () => {
    const variants = [
      "default",
      "destructive",
      "outline",
      "secondary",
      "ghost",
      "link",
    ] as const;

    it.each(variants)("renders %s variant without crashing", (variant) => {
      const { getByText } = render(
        <Button variant={variant}>Press me</Button>,
      );
      expect(getByText("Press me")).toBeTruthy();
    });
  });

  describe("sizes", () => {
    const sizes = ["default", "sm", "lg", "icon"] as const;

    it.each(sizes)("renders %s size without crashing", (size) => {
      const { getByText } = render(<Button size={size}>Sized</Button>);
      expect(getByText("Sized")).toBeTruthy();
    });
  });

  it("fires onPress callback", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button onPress={onPress}>Tap</Button>,
    );
    fireEvent.press(getByText("Tap"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire onPress when disabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button disabled onPress={onPress}>
        Disabled
      </Button>,
    );
    fireEvent.press(getByText("Disabled"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("renders children that are not strings (e.g. a View)", () => {
    const { getByTestId } = render(
      <Button>
        <React.Fragment>
          <>{/* intentionally empty, just testing non-string children */}</>
        </React.Fragment>
      </Button>,
    );
    // If it does not throw, the test passes.
    expect(true).toBe(true);
  });

  it("renders with leftIcon and rightIcon", () => {
    const { getByText } = render(
      <Button
        leftIcon={<React.Fragment />}
        rightIcon={<React.Fragment />}
      >
        With Icons
      </Button>,
    );
    expect(getByText("With Icons")).toBeTruthy();
  });
});
