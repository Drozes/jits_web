import { fireEvent, render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import {
  UPDATE_BANNER_BODY,
  UPDATE_BANNER_BOTTOM_OFFSET,
  UPDATE_BANNER_COPY,
  UpdateBanner,
} from "@/components/updates/update-banner";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ background: "#0D0F14" }),
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
  it("renders the two-line copy and announces the full copy once", () => {
    const spy = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const { getByText, getByLabelText, rerender, onRestart, onDismiss } = setup();
    expect(getByText("Update ready")).toBeTruthy();
    // Visible line 2, hidden from screen readers (the label carries the full copy).
    expect(
      getByText("Restart for the latest experience.", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(UPDATE_BANNER_BODY).toBe("Restart for the latest experience.");
    expect(UPDATE_BANNER_COPY).toBe("App updated. Restart for the latest experience.");
    // Screen readers read the full sentence for the label line.
    expect(getByLabelText(UPDATE_BANNER_COPY)).toBeTruthy();
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

  it("RESTART is solid inverted contrast, never the red primary", () => {
    const { getByTestId, getByText } = setup();
    const cls = getByTestId("update-banner-restart").props.className as string;
    expect(cls).toContain("bg-background");
    expect(cls).not.toMatch(/bg-(primary|cta|destructive)|bg-transparent/);
    expect(getByText("Restart").props.className).toContain("text-foreground");
  });

  it("uses the inverted high-contrast surface with inverted text", () => {
    const { getByTestId, getByText } = setup();
    const surface = getByTestId("update-banner-surface").props.className as string;
    expect(surface).toContain("bg-foreground");
    expect(surface).toContain("rounded-md");
    expect(surface).not.toMatch(/bg-surface-2|shadow|elevation/);
    const label = getByText("Update ready").props.className as string;
    expect(label).toMatch(/font-heading.*uppercase.*tracking-caps-l.*text-background/);
    const body = getByText(UPDATE_BANNER_BODY, { includeHiddenElements: true }).props
      .className as string;
    expect(body).toContain("font-body");
    expect(body).toContain("text-base");
    expect(body).toContain("text-background");
  });

  it("keeps line 2 out of the a11y tree (the label carries the full copy)", () => {
    const { queryByText } = setup();
    expect(queryByText(UPDATE_BANNER_BODY)).toBeNull();
  });

  it("exposes both actions as buttons to assistive tech", () => {
    const { getAllByRole, getByRole } = setup();
    expect(getAllByRole("button")).toHaveLength(2);
    expect(getByRole("button", { name: "Dismiss update notice" })).toBeTruthy();
    expect(getByRole("button", { name: "Restart" })).toBeTruthy();
  });

  it("the dismiss target is a full 44pt square without growing the row", () => {
    const cls = setup().getByTestId("update-banner-dismiss").props.className as string;
    expect(cls).toContain("h-[44px]");
    expect(cls).toContain("w-[44px]");
    expect(cls).toMatch(/-my-/);
    expect(setup().getByTestId("update-banner-dismiss").props.hitSlop).toBe(8);
  });

  it("stays fully opaque (readable) while restarting", () => {
    const cls = setup(true).getByTestId("update-banner-restart").props.className as string;
    // Button adds opacity-50 when disabled; cn (twMerge) keeps only the last opacity.
    expect(cls).toContain("opacity-100");
    expect(cls).not.toContain("opacity-50");
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
