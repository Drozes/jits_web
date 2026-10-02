/**
 * WP1 (jits-3eeg.2), sheet and modal chrome:
 *
 *  - SH-1/SH-2: one shared sheet background (`panel`, 8px top corners, square
 *    bottom, `hairline` top edge) and handle (30x4 `ink-3`) for every gorhom
 *    sheet, never gorhom's default 15px radius or the legacy `card` tokens;
 *  - SH-3: brand type in `SheetTitle` / `DialogTitle` / descriptions and the
 *    ELO surface on `DialogContent`;
 *  - SH-4: one scrim (`on-media-scrim`, `ON_MEDIA.scrim`) behind every sheet
 *    and modal, with the Tailwind mirror kept equal;
 *  - MO-5: "Sheet / modal present" is Reduce-Motion-aware for RN `Modal`
 *    (`useModalAnimation`) and gorhom (`animationConfigs`);
 *  - A1-1: the dialog backdrop is a labeled button and a sibling of the card.
 */
import * as React from "react";
import { Modal, StyleSheet, Text } from "react-native";
import { act, fireEvent, render, renderHook } from "@testing-library/react-native";
import { ReduceMotion } from "react-native-reanimated";

jest.mock("nativewind", () => ({
  ...jest.requireActual("nativewind"),
  useColorScheme: () => ({ colorScheme: "dark", setColorScheme: jest.fn() }),
}));

type SheetProps = Record<string, unknown> & { children?: React.ReactNode };
const mockSheetProps: SheetProps[] = [];
const mockBackdropProps: Record<string, unknown>[] = [];
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  const BottomSheetModal = R.forwardRef((props: SheetProps, ref: unknown) => {
    R.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
    mockSheetProps.push(props);
    return R.createElement(RN.View, { testID: "gorhom-sheet" }, props.children);
  });
  const Pass = ({ children }: { children?: React.ReactNode }) => R.createElement(RN.View, null, children);
  const BottomSheetBackdrop = (props: Record<string, unknown>) => {
    mockBackdropProps.push(props);
    return null;
  };
  return { BottomSheetModal, BottomSheetView: Pass, BottomSheetBackdrop };
});

import {
  SHEET_RADIUS,
  Sheet,
  SheetBackdrop,
  SheetBackground,
  SheetContent,
  SheetDescription,
  SheetTitle,
  sheetBackgroundStyle,
  sheetHandleIndicatorStyle,
  useSheetChrome,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  __setReduceMotionForTests,
  duration,
  easing,
  modalAnimationFor,
  sheetAnimationConfigsFor,
  useModalAnimation,
} from "@/lib/motion";
import { ON_MEDIA } from "@/lib/theme/palette";
import { darkTokens, lightTokens } from "@/lib/tokens";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwind = require("../../../tailwind.config.js");

beforeEach(() => {
  mockSheetProps.length = 0;
  mockBackdropProps.length = 0;
  __setReduceMotionForTests(false);
});

afterAll(() => {
  __setReduceMotionForTests(false);
});

describe("shared sheet background and handle (SH-1, SH-2)", () => {
  it.each([
    ["dark", darkTokens],
    ["light", lightTokens],
  ] as const)("uses panel, 8px top corners, a square bottom and a hairline edge (%s)", (_name, tokens) => {
    const style = sheetBackgroundStyle(tokens);
    expect(SHEET_RADIUS).toBe(8);
    expect(style.backgroundColor).toBe(tokens.bgSecondary);
    // borderRadius 0 beats gorhom's default 15 on the bottom corners.
    expect(style.borderRadius).toBe(0);
    expect(style.borderTopLeftRadius).toBe(8);
    expect(style.borderTopRightRadius).toBe(8);
    expect(style.borderTopWidth).toBe(1);
    expect(style.borderTopColor).toBe(tokens.borderHairline);
  });

  it("draws a 30x4 ink-3 handle", () => {
    const handle = sheetHandleIndicatorStyle(darkTokens);
    expect(handle).toMatchObject({ width: 30, height: 4, backgroundColor: darkTokens.textTertiary });
  });

  it("never uses the legacy card / mutedForeground colors (deleted from the token map by WP4)", () => {
    expect("card" in darkTokens).toBe(false);
    expect("mutedForeground" in darkTokens).toBe(false);
    // The retired dark card and muted-foreground values.
    expect(sheetBackgroundStyle(darkTokens).backgroundColor).not.toBe("hsl(222, 16%, 12%)");
    expect(sheetHandleIndicatorStyle(darkTokens).backgroundColor).not.toBe("hsl(218, 11%, 65%)");
  });

  it("the background view is purely visual (no 'Bottom Sheet' VoiceOver stop)", () => {
    const screen = render(
      <SheetBackground
        style={sheetBackgroundStyle(darkTokens)}
        pointerEvents="none"
        animatedIndex={{ value: 0 } as never}
        animatedPosition={{ value: 0 } as never}
      />,
    );
    const view = screen.UNSAFE_root.findByProps({ importantForAccessibility: "no" });
    expect(view.props.accessible).toBe(false);
    expect(StyleSheet.flatten(view.props.style).borderTopLeftRadius).toBe(8);
  });

  it("the shadcn SheetContent spreads the shared chrome onto gorhom", () => {
    render(
      <Sheet>
        <SheetContent>
          <Text>Body</Text>
        </SheetContent>
      </Sheet>,
    );
    const props = mockSheetProps[mockSheetProps.length - 1];
    expect(props.backgroundComponent).toBe(SheetBackground);
    expect(props.backgroundStyle).toEqual(sheetBackgroundStyle(darkTokens));
    expect(props.handleIndicatorStyle).toEqual(sheetHandleIndicatorStyle(darkTokens));
    expect(props.animationConfigs).toEqual(sheetAnimationConfigsFor(false));
  });
});

describe("one scrim (SH-4)", () => {
  it("the Tailwind `on-media-scrim` mirrors ON_MEDIA.scrim", () => {
    expect(ON_MEDIA.scrim).toBe("rgba(0,0,0,0.55)");
    expect(tailwind.theme.extend.colors["on-media-scrim"]).toBe(ON_MEDIA.scrim);
  });

  it("SheetBackdrop fills with the scrim at full opacity, closes on press by default", () => {
    render(<SheetBackdrop animatedIndex={{ value: 0 } as never} animatedPosition={{ value: 0 } as never} style={{ flex: 1 }} />);
    const props = mockBackdropProps[mockBackdropProps.length - 1];
    expect(props.opacity).toBe(1);
    expect(props.appearsOnIndex).toBe(0);
    expect(props.disappearsOnIndex).toBe(-1);
    expect(props.pressBehavior).toBe("close");
    expect(StyleSheet.flatten(props.style as never)).toMatchObject({ flex: 1, backgroundColor: ON_MEDIA.scrim });
  });

  it("SheetBackdrop keeps a caller's press behavior (a busy feedback sheet)", () => {
    render(
      <SheetBackdrop
        animatedIndex={{ value: 0 } as never}
        animatedPosition={{ value: 0 } as never}
        pressBehavior="none"
      />,
    );
    expect(mockBackdropProps[mockBackdropProps.length - 1].pressBehavior).toBe("none");
  });
});

describe("Sheet / modal present is Reduce-Motion-aware (MO-5)", () => {
  it("modalAnimationFor keeps the presentation, or none under Reduce Motion", () => {
    expect(modalAnimationFor("slide", false)).toBe("slide");
    expect(modalAnimationFor("fade", false)).toBe("fade");
    expect(modalAnimationFor("slide", true)).toBe("none");
    expect(modalAnimationFor("fade", true)).toBe("none");
  });

  it("useModalAnimation follows the live setting", () => {
    const { result, rerender } = renderHook(() => useModalAnimation("slide"));
    expect(result.current).toBe("slide");
    act(() => __setReduceMotionForTests(true));
    rerender({});
    expect(result.current).toBe("none");
  });

  it("gorhom configs: fast brand ease-out, landing at once under Reduce Motion", () => {
    const normal = sheetAnimationConfigsFor(false);
    expect(normal.duration).toBe(duration.fast);
    expect(normal.easing).toBe(easing.brandOut);
    expect(normal.reduceMotion).toBe(ReduceMotion.System);
    expect(sheetAnimationConfigsFor(true).reduceMotion).toBe(ReduceMotion.Always);
  });

  it("useSheetChrome carries the Reduce Motion config", () => {
    __setReduceMotionForTests(true);
    const { result } = renderHook(() => useSheetChrome());
    expect(result.current.animationConfigs.reduceMotion).toBe(ReduceMotion.Always);
  });
});

describe("brand typography and ELO surfaces (SH-3)", () => {
  const LEGACY = /text-foreground|text-card-foreground|text-muted-foreground|font-semibold|text-lg|text-sm|bg-card|border-border|bg-black/;

  it("SheetTitle is a DM Sans caps header in ink; SheetDescription is Inter ink-2", () => {
    const screen = render(
      <>
        <SheetTitle>Share Profile</SheetTitle>
        <SheetDescription>Body</SheetDescription>
      </>,
    );
    const title = screen.getByText("Share Profile");
    expect(title.props.accessibilityRole).toBe("header");
    expect(String(title.props.className)).toMatch(/font-heading/);
    expect(String(title.props.className)).toMatch(/uppercase/);
    expect(String(title.props.className)).toMatch(/tracking-caps-l/);
    expect(String(title.props.className)).toMatch(/text-ink(\s|$)/);
    expect(String(title.props.className)).not.toMatch(LEGACY);
    const description = screen.getByText("Body");
    expect(String(description.props.className)).toMatch(/font-body/);
    expect(String(description.props.className)).toMatch(/text-ink-2/);
    expect(String(description.props.className)).not.toMatch(LEGACY);
  });

  function renderDialog(onOpenChange = jest.fn()) {
    const screen = render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Compare Stats</DialogTitle>
          <DialogDescription>Side by side</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    return { screen, onOpenChange };
  }

  it("DialogTitle / DialogDescription use the brand families", () => {
    const { screen } = renderDialog();
    const title = screen.getByText("Compare Stats");
    expect(title.props.accessibilityRole).toBe("header");
    expect(String(title.props.className)).toMatch(/font-heading.*uppercase|uppercase.*font-heading/);
    expect(String(title.props.className)).not.toMatch(LEGACY);
    const description = screen.getByText("Side by side");
    expect(String(description.props.className)).toMatch(/font-body/);
    expect(String(description.props.className)).toMatch(/text-ink-2/);
  });

  it("DialogContent: panel card with a hairline, 8px, over the one scrim; fades, none under Reduce Motion", () => {
    const { screen } = renderDialog();
    expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe("fade");
    const backdrop = screen.getByTestId("dialog-backdrop");
    const card = screen.getByTestId("dialog-card");
    expect(String(card.props.className)).toMatch(/bg-surface-2/);
    expect(String(card.props.className)).toMatch(/border-hairline/);
    expect(String(card.props.className)).toMatch(/rounded-lg/);
    expect(String(card.props.className)).not.toMatch(LEGACY);
    // The scrim wraps both the backdrop button and the card.
    const scrim = screen.getByTestId("dialog-scrim");
    expect(String(scrim.props.className)).toMatch(/bg-on-media-scrim/);
    expect(scrim.findAllByProps({ testID: "dialog-backdrop" }).length).toBeGreaterThan(0);
    expect(backdrop).toBeTruthy();

    __setReduceMotionForTests(true);
    const again = renderDialog();
    expect(again.screen.UNSAFE_getByType(Modal).props.animationType).toBe("none");
  });

  it("the backdrop is a labeled button that closes, and does not contain the card (A1-1)", () => {
    const { screen, onOpenChange } = renderDialog();
    const backdrop = screen.getByRole("button", { name: "Close" });
    expect(backdrop.findAllByProps({ testID: "dialog-card" })).toHaveLength(0);
    // The card's own content stays reachable on its own.
    expect(screen.getByRole("header", { name: "Compare Stats" })).toBeTruthy();
    fireEvent.press(backdrop);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("VoiceOver: the backdrop's accessibility tap and the escape gesture both close", () => {
    const tap = renderDialog();
    const backdrop = tap.screen.getByTestId("dialog-backdrop");
    expect(typeof backdrop.props.onAccessibilityTap).toBe("function");
    act(() => backdrop.props.onAccessibilityTap());
    expect(tap.onOpenChange).toHaveBeenCalledWith(false);

    const escape = renderDialog();
    const scrim = escape.screen.getByTestId("dialog-scrim");
    expect(typeof scrim.props.onAccessibilityEscape).toBe("function");
    act(() => scrim.props.onAccessibilityEscape());
    expect(escape.onOpenChange).toHaveBeenCalledWith(false);
  });
});
