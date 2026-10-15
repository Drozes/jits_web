/**
 * Android hardware back on gorhom sheets (jits-mafl.2 M7):
 *
 *  - `useSheetBackHandler` registers only while the sheet is open, consumes
 *    the back (returns true), calls `onBack` once per opening (no second
 *    dismiss while gorhom animates out), swallows it while busy, and goes
 *    away when the sheet closes or unmounts;
 *  - `Sheet` / `SheetContent` and `FormSheet` close on back, and only a
 *    sheet they presented;
 *  - guard: every `BottomSheetModal` in app/ and components/ uses the hook;
 *  - jits-mafl.2.1: a back during the present animation never leaves the back
 *    swallowed for good: a dismiss gorhom dropped is re-issued once the sheet
 *    settles open (`onChange` >= 0), a close reported only by `onDismiss`
 *    counts as closed, and a watchdog clears the latch as a backstop.
 *
 * Source: apps/mobile/components/ui/use-sheet-back-handler.ts, sheet.tsx,
 * form-sheet.tsx
 */
import * as fs from "fs";
import * as path from "path";
import * as React from "react";
import { BackHandler, Text } from "react-native";
import { act, fireEvent, render, renderHook } from "@testing-library/react-native";

const mockPresent = jest.fn();
const mockDismiss = jest.fn();
let mockOnChange: ((i: number) => void) | null = null;
let mockOnAnimate: ((from: number, to: number) => void) | null = null;
let mockOnDismiss: (() => void) | null = null;
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  const BottomSheetModal = R.forwardRef(
    (
      props: {
        children?: React.ReactNode;
        onChange?: (i: number) => void;
        onAnimate?: (f: number, t: number) => void;
        onDismiss?: () => void;
      },
      ref: unknown,
    ) => {
      R.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: mockDismiss }));
      mockOnChange = props.onChange ?? null;
      mockOnAnimate = props.onAnimate ?? null;
      mockOnDismiss = props.onDismiss ?? null;
      return R.createElement(RN.View, { testID: "gorhom-sheet" }, props.children);
    },
  );
  const Pass = ({ children }: { children?: React.ReactNode }) => R.createElement(RN.View, null, children);
  return { BottomSheetModal, BottomSheetView: Pass, BottomSheetBackdrop: () => null };
});
jest.mock("@/lib/theme/use-sheet-scheme-scope", () => ({
  useSheetSchemeScope: () => (children: React.ReactNode) => children,
}));

import { SHEET_BACK_CLOSE_WATCHDOG_MS, useSheetBackHandler } from "@/components/ui/use-sheet-back-handler";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { FormSheet } from "@/components/ui/form-sheet";

type BackListener = () => boolean | null | undefined;
let listeners: BackListener[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockOnChange = null;
  mockOnAnimate = null;
  mockOnDismiss = null;
  listeners = [];
  jest.spyOn(BackHandler, "addEventListener").mockImplementation(((_e: string, fn: BackListener) => {
    listeners.push(fn);
    return {
      remove: () => {
        listeners = listeners.filter((l) => l !== fn);
      },
    };
  }) as never);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** What React Native does: newest listener first, stop at the first `true`. */
function pressBack(): boolean {
  for (const l of [...listeners].reverse()) if (l()) return true;
  return false;
}

describe("useSheetBackHandler", () => {
  it("registers nothing while closed", () => {
    const onBack = jest.fn(() => true);
    renderHook(() => useSheetBackHandler({ open: false, onBack }));
    expect(listeners).toHaveLength(0);
    expect(pressBack()).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("while open: consumes the back and calls onBack once per opening", () => {
    const onBack = jest.fn(() => true);
    const { rerender } = renderHook(({ open }: { open: boolean }) => useSheetBackHandler({ open, onBack }), {
      initialProps: { open: true },
    });
    expect(pressBack()).toBe(true);
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    rerender({ open: false });
    expect(listeners).toHaveLength(0);
    expect(pressBack()).toBe(false);
    rerender({ open: true });
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("while busy: consumes the back without closing, then closes once not busy", () => {
    const onBack = jest.fn(() => true);
    const { rerender } = renderHook(({ busy }: { busy: boolean }) => useSheetBackHandler({ open: true, busy, onBack }), {
      initialProps: { busy: true },
    });
    expect(pressBack()).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
    rerender({ busy: false });
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("an onBack that started no close (false) is called again on the next press", () => {
    const onBack = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    renderHook(() => useSheetBackHandler({ open: true, onBack }));
    expect(pressBack()).toBe(true);
    expect(pressBack()).toBe(true);
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("calls the latest onBack and removes its listener on unmount", () => {
    const first = jest.fn(() => true);
    const second = jest.fn(() => true);
    const { rerender, unmount } = renderHook(({ fn }: { fn: () => boolean }) => useSheetBackHandler({ open: true, onBack: fn }), {
      initialProps: { fn: first },
    });
    rerender({ fn: second });
    pressBack();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unmount();
    expect(listeners).toHaveLength(0);
  });

  it("jits-mafl.2.1: a close gorhom dropped is re-issued once the sheet settles open", () => {
    const onBack = jest.fn(() => true);
    const { result } = renderHook(() => useSheetBackHandler({ open: true, onBack }));
    // Back during the present animation: the dismiss is dropped, the sheet settles open.
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    act(() => result.current.onChange(0));
    expect(onBack).toHaveBeenCalledTimes(2);
    // That retry is now the close in flight: further presses are consumed, no third dismiss.
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("onChange re-issues nothing without a back-started close, on a close (-1), when busy or closed", () => {
    const onBack = jest.fn(() => true);
    const { result, rerender } = renderHook(
      ({ open, busy }: { open: boolean; busy: boolean }) => useSheetBackHandler({ open, busy, onBack }),
      { initialProps: { open: true, busy: false } },
    );
    act(() => result.current.onChange(0)); // a normal opening
    expect(onBack).not.toHaveBeenCalled();
    pressBack();
    act(() => result.current.onChange(-1)); // the close took
    expect(onBack).toHaveBeenCalledTimes(1);
    rerender({ open: true, busy: true });
    act(() => result.current.onChange(0));
    expect(onBack).toHaveBeenCalledTimes(1);
    rerender({ open: false, busy: false });
    act(() => result.current.onChange(0));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("jits-mafl.2.1 backstop: with no report at all, the latch clears after the watchdog", () => {
    jest.useFakeTimers();
    const onBack = jest.fn(() => true);
    renderHook(() => useSheetBackHandler({ open: true, onBack }));
    pressBack();
    act(() => jest.advanceTimersByTime(SHEET_BACK_CLOSE_WATCHDOG_MS - 1));
    pressBack();
    expect(onBack).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(1));
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("stacked sheets: the one opened last closes first", () => {
    const lower = jest.fn(() => true);
    const upper = jest.fn(() => true);
    renderHook(() => useSheetBackHandler({ open: true, onBack: lower }));
    const top = renderHook(({ open }: { open: boolean }) => useSheetBackHandler({ open, onBack: upper }), {
      initialProps: { open: true },
    });
    pressBack();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
    top.rerender({ open: false });
    pressBack();
    expect(lower).toHaveBeenCalledTimes(1);
  });
});

describe("Sheet / SheetContent", () => {
  function Harness() {
    return (
      <Sheet>
        <SheetTrigger>
          <Text>Open</Text>
        </SheetTrigger>
        <SheetContent>
          <Text>Body</Text>
        </SheetContent>
      </Sheet>
    );
  }

  it("isOpen follows the modal (onChange), not the present() call", () => {
    const screen = render(<Harness />);
    fireEvent.press(screen.getByText("Open"));
    expect(pressBack()).toBe(false);
    act(() => mockOnChange?.(0));
    expect(pressBack()).toBe(true);
  });

  it("review SF1: back is consumed from the START of the present animation (onAnimate), before onChange", () => {
    const screen = render(<Harness />);
    fireEvent.press(screen.getByText("Open"));
    act(() => mockOnAnimate?.(-1, 0));
    expect(pressBack()).toBe(true);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    // The close animation (toward -1) does not reopen it; onChange(-1) clears it.
    act(() => mockOnAnimate?.(0, -1));
    act(() => mockOnChange?.(-1));
    expect(pressBack()).toBe(false);
  });

  it("jits-mafl.2.1: a back mid-present whose close reports only onDismiss frees the back, and the next opening closes on back", () => {
    const screen = render(<Harness />);
    fireEvent.press(screen.getByText("Open"));
    act(() => mockOnAnimate?.(-1, 0));
    expect(pressBack()).toBe(true);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    // gorhom closed mid-present: its index never reached 0, so no onChange(-1).
    act(() => mockOnDismiss?.());
    expect(pressBack()).toBe(false);
    // Reopen and let it settle: the back closes it again.
    fireEvent.press(screen.getByText("Open"));
    act(() => mockOnAnimate?.(-1, 0));
    act(() => mockOnChange?.(0));
    expect(pressBack()).toBe(true);
    expect(mockDismiss).toHaveBeenCalledTimes(2);
  });

  it("jits-mafl.2.1: a back mid-present whose dismiss gorhom dropped still ends closed", () => {
    const screen = render(<Harness />);
    fireEvent.press(screen.getByText("Open"));
    act(() => mockOnAnimate?.(-1, 0));
    pressBack();
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    // The sheet settled open anyway: the dismiss is issued again, once.
    act(() => mockOnChange?.(0));
    expect(mockDismiss).toHaveBeenCalledTimes(2);
    expect(pressBack()).toBe(true);
    expect(mockDismiss).toHaveBeenCalledTimes(2);
    act(() => mockOnChange?.(-1));
    expect(pressBack()).toBe(false);
  });

  it("never presented: back passes through", () => {
    render(<Harness />);
    expect(pressBack()).toBe(false);
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it("open: back dismisses once; once closed, back passes through again", () => {
    const screen = render(<Harness />);
    fireEvent.press(screen.getByText("Open"));
    expect(mockPresent).toHaveBeenCalledTimes(1);
    act(() => mockOnChange?.(0));
    expect(pressBack()).toBe(true);
    expect(pressBack()).toBe(true);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    act(() => mockOnChange?.(-1));
    expect(pressBack()).toBe(false);
  });

  it("closed by a swipe: back passes through and never dismisses a closed sheet", () => {
    const screen = render(<Harness />);
    fireEvent.press(screen.getByText("Open"));
    act(() => mockOnChange?.(0));
    act(() => mockOnChange?.(-1));
    expect(pressBack()).toBe(false);
    expect(mockDismiss).not.toHaveBeenCalled();
  });
});

describe("FormSheet", () => {
  function mount(props: { open: boolean; busy: boolean }) {
    const onClosed = jest.fn();
    const utils = render(
      <FormSheet {...props} onClosed={onClosed}>
        <Text>Form</Text>
      </FormSheet>,
    );
    return { ...utils, onClosed };
  }

  it("open: back dismisses the sheet it presented", () => {
    mount({ open: true, busy: false });
    expect(mockPresent).toHaveBeenCalledTimes(1);
    expect(pressBack()).toBe(true);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("busy: back is swallowed and the sheet stays", () => {
    mount({ open: true, busy: true });
    expect(pressBack()).toBe(true);
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it("closed: back passes through", () => {
    mount({ open: false, busy: false });
    expect(pressBack()).toBe(false);
  });

  it("jits-mafl.2.1: a close reported only by onDismiss reports onClosed once", () => {
    const { onClosed } = mount({ open: true, busy: false });
    pressBack();
    act(() => mockOnDismiss?.());
    expect(onClosed).toHaveBeenCalledTimes(1);
    act(() => mockOnChange?.(-1));
    act(() => mockOnDismiss?.());
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("jits-mafl.2.1: a dismiss dropped mid-present is re-issued when the sheet settles open", () => {
    mount({ open: true, busy: false });
    pressBack();
    act(() => mockOnChange?.(0));
    expect(mockDismiss).toHaveBeenCalledTimes(2);
  });
});

describe("guard: every gorhom sheet handles the Android back", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }
  const files = ["app", "components", "lib"]
    .flatMap((d) => walk(path.join(ROOT, d)))
    .map((full) => ({ rel: path.relative(ROOT, full).split(path.sep).join("/"), src: fs.readFileSync(full, "utf8") }))
    // Comments stripped: a `<BottomSheetModal>` mention in prose is not a sheet.
    .filter((f) => /<BottomSheet(Modal)?[\s>]/.test(f.src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));

  it("finds the sheets", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it("each file that renders a BottomSheet or BottomSheetModal calls useSheetBackHandler", () => {
    expect(files.filter((f) => !/useSheetBackHandler\(/.test(f.src)).map((f) => f.rel)).toEqual([]);
  });

  // jits-mafl.2.1: without these a back during the present animation can
  // leave the sheet open (a dropped dismiss is never re-issued) or the back
  // swallowed for good (a close reported only by onDismiss is never seen).
  const users = ["app", "components", "lib"]
    .flatMap((d) => walk(path.join(ROOT, d)))
    .map((full) => ({ rel: path.relative(ROOT, full).split(path.sep).join("/"), src: fs.readFileSync(full, "utf8") }))
    .filter((f) => !f.rel.endsWith("use-sheet-back-handler.ts") && /useSheetBackHandler\(/.test(f.src));

  it("finds the hook's users", () => {
    expect(users.length).toBeGreaterThanOrEqual(6);
  });

  it("each user forwards the sheet's onChange to the hook's returned onChange", () => {
    expect(users.filter((f) => !/\.onChange\(/.test(f.src)).map((f) => f.rel)).toEqual([]);
  });

  it("each user wires the sheet's onDismiss", () => {
    expect(users.filter((f) => !/onDismiss=\{/.test(f.src)).map((f) => f.rel)).toEqual([]);
  });
});
