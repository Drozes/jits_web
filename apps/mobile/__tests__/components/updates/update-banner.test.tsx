import { fireEvent, render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import {
  UPDATE_BANNER_BOTTOM_OFFSET,
  UPDATE_BANNER_COPY,
  UpdateBanner,
} from "@/components/updates/update-banner";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ mutedForeground: "#999" }),
}));

function setup(restarting = false) {
  const onRestart = jest.fn();
  const onDismiss = jest.fn();
  const utils = render(
    <UpdateBanner onRestart={onRestart} onDismiss={onDismiss} restarting={restarting} />,
  );
  return { ...utils, onRestart, onDismiss };
}

describe("UpdateBanner", () => {
  it("renders the exact copy and announces it once", () => {
    const spy = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const { getByText, rerender, onRestart, onDismiss } = setup();
    expect(getByText("App updated. Restart for the latest experience.")).toBeTruthy();
    expect(UPDATE_BANNER_COPY).toBe("App updated. Restart for the latest experience.");
    rerender(<UpdateBanner onRestart={onRestart} onDismiss={onDismiss} restarting />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(UPDATE_BANNER_COPY);
  });

  it("Restart calls onRestart", () => {
    const { getByText, onRestart } = setup();
    fireEvent.press(getByText("Restart"));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("X calls onDismiss", () => {
    const { getByLabelText, onDismiss } = setup();
    fireEvent.press(getByLabelText("Dismiss update notice"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("while restarting: disabled with Restarting... label", () => {
    const { getByText, queryByText, getByTestId, onRestart } = setup(true);
    expect(getByText("Restarting...")).toBeTruthy();
    expect(queryByText("Restart")).toBeNull();
    fireEvent.press(getByTestId("update-banner-restart"));
    expect(onRestart).not.toHaveBeenCalled();
  });

  it("uses the outline variant, never the red primary", () => {
    const { getByTestId } = setup();
    const cls = getByTestId("update-banner-restart").props.className as string;
    expect(cls).toContain("border-input");
    expect(cls).not.toContain("bg-primary");
  });

  it("clears the tab bar above the bottom inset", () => {
    const { toJSON } = setup();
    const root = toJSON() as { props: { style: { bottom: number } } };
    expect(root.props.style.bottom).toBe(34 + UPDATE_BANNER_BOTTOM_OFFSET);
  });

  it("uses the app's uppercase heading button typography", () => {
    const { getByText } = setup();
    const cls = getByText("Restart").props.className as string;
    expect(cls).toContain("uppercase");
    expect(cls).toContain("font-heading");
  });
});
