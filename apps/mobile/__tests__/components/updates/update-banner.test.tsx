import { fireEvent, render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { StyleSheet } from "react-native";
import {
  UPDATE_BANNER_BUTTON_HEIGHT,
  UPDATE_BANNER_BODY,
  UPDATE_BANNER_BOTTOM_OFFSET,
  UPDATE_BANNER_COPY,
  UpdateBanner,
} from "@/components/updates/update-banner";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({
    textPrimary: "#E8EDF2",
    bgElevated: "#1E222B",
    bgElevatedHover: "#262A34",
    borderHairlineStrong: "rgba(107, 114, 128, 0.62)",
  }),
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

  it("RESTART is the unified Button secondary variant, never the red primary (R3 SC-2)", () => {
    const { getByTestId } = setup();
    const btn = getByTestId("update-banner-restart");
    const cls = btn.props.className as string;
    expect(cls).toContain("bg-surface-3");
    expect(cls).toContain("border-hairline-strong");
    expect(cls).not.toMatch(/bg-(primary|cta|destructive|background|foreground)/);
    const st = StyleSheet.flatten(btn.props.style);
    expect(st.backgroundColor).toBe("#1E222B");
    expect(st.minHeight).toBe(UPDATE_BANNER_BUTTON_HEIGHT);
  });

  it("sits on the ELO panel surface (one tier below its plate RESTART) with ink text, no legacy inverted tokens (R3 SC-2)", () => {
    const { getByTestId, getByText } = setup();
    const surface = getByTestId("update-banner-surface").props.className as string;
    expect(surface).toContain("bg-surface-2");
    expect(surface).not.toContain("bg-surface-3");
    expect(surface).toContain("border-hairline-strong");
    expect(surface).toContain("rounded-md");
    expect(surface).not.toMatch(/bg-foreground|bg-background|shadow|elevation/);
    const label = getByText("Update ready").props.className as string;
    expect(label).toMatch(/font-heading.*uppercase.*tracking-caps-l.*text-ink/);
    expect(label).not.toMatch(/text-background|text-foreground/);
    const body = getByText(UPDATE_BANNER_BODY, { includeHiddenElements: true }).props
      .className as string;
    expect(body).toContain("font-body");
    expect(body).toContain("text-callout");
    expect(body).toContain("text-ink-2");
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

  it("stays fully opaque (readable) and inert while restarting (busy, not disabled)", () => {
    const btn = setup(true).getByTestId("update-banner-restart");
    expect(StyleSheet.flatten(btn.props.style).opacity).toBeUndefined();
    expect(btn.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
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
